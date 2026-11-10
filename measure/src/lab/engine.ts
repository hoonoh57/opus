// Strategy engine (docs/07 4 FM1-FM5, 12). Signals on confirmed bars only; fills at next bar open +/- slippage.
import { parse, validate, evalAt, truthy, FormulaError, type Node, type Scope, type Ctx } from './formula.ts';
import { INDICATORS, type Bar, type Series } from './indicators.ts';

export interface StrategyDef {
  id: string; version: number; name: string;
  params: Record<string, { value: number }>;
  indicators: Record<string, { fn: string; args: string[] }>;
  entry: string;
  exits: { id: string; label?: string; when: string }[];
  reentry: boolean;
}

export const BAR_VARS = ['open', 'high', 'low', 'close', 'volume'];
export const POS_VARS = ['netPct', 'barsInPos', 'minSinceCapture', 'gapPct', 'capPct'];

export interface Compiled { def: StrategyDef; params: Record<string, number>; entry: Node; exits: { id: string; node: Node }[]; }

export function compile(def: StrategyDef, overrides: Record<string, number> = {}): Compiled {
  const params: Record<string, number> = {};
  for (const [k, p] of Object.entries(def.params || {})) params[k] = k in overrides ? overrides[k] : Number(p.value);
  const indicators: Record<string, string[]> = {};
  for (const [name, d] of Object.entries(def.indicators || {})) {
    const spec = INDICATORS[d.fn];
    if (!spec) throw new FormulaError('indicator not available: ' + d.fn, 0);
    if (name in params || BAR_VARS.includes(name) || POS_VARS.includes(name)) throw new FormulaError('name clash: ' + name, 0);
    for (const a of d.args) if (!(a in params)) throw new FormulaError('indicator ' + name + ' arg is not a param: ' + a, 0);
    indicators[name] = spec.fields;
  }
  const sc: Scope = { params, indicators, vars: new Set([...BAR_VARS, ...POS_VARS]) };
  const one = (label: string, src: string): Node => {
    try { const n = parse(String(src)); validate(n, sc); return n; }
    catch (e: any) { throw new FormulaError(label + ': ' + e.message, e.pos ?? 0); }
  };
  return { def, params, entry: one('entry', def.entry), exits: (def.exits || []).map((x) => ({ id: x.id, node: one('exit ' + x.id, x.when) })) };
}

export function computeIndicators(c: Compiled, bars: readonly Bar[]): Record<string, Series> {
  const out: Record<string, Series> = {};
  for (const [name, d] of Object.entries(c.def.indicators || {})) out[name] = INDICATORS[d.fn].calc(bars, d.args.map((a) => c.params[a]));
  return out;
}

export function krxTick(p: number): number {
  if (p < 2000) return 1;
  if (p < 5000) return 5;
  if (p < 20000) return 10;
  if (p < 50000) return 50;
  if (p < 200000) return 100;
  if (p < 500000) return 500;
  return 1000;
}

export const kstMin = (t: number): number => Math.floor((((Math.floor(t) + 9 * 3600) % 86400) + 86400) % 86400 / 60);
const hm = (s: string): number => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const r4 = (x: number): number => Math.round(x * 10000) / 10000;

export interface RunOpts { feePct?: number; taxPct?: number; slipTicks?: number; tx?: string; capture?: { index: number; price: number }; prevClose?: number; }
export interface Trade {
  sigIn: number; inIdx: number; inTime: number; inPx: number;
  sigOut: number; outIdx: number; outTime: number; outPx: number;
  reason: string; netPct: number; mfePct: number;
}

export function run(c: Compiled, bars: readonly Bar[], o: RunOpts = {}) {
  const fee = o.feePct ?? 0.015, tax = o.taxPct ?? 0.2, slip = o.slipTicks ?? 1, tx = hm(o.tx ?? '15:15');
  const ind = computeIndicators(c, bars);
  const net = (inPx: number, px: number) => ((px * (1 - (fee + tax) / 100)) / (inPx * (1 + fee / 100)) - 1) * 100;
  let pos: { sigIn: number; inIdx: number; inPx: number } | null = null;
  let pending: { kind: 'BUY' | 'SELL'; sig: number; reason: string } | null = null;
  let traded = false;
  let i = 0;
  const trades: Trade[] = [];
  const signals: { i: number; kind: string; reason: string }[] = [];

  const posVars = (): Record<string, number> => {
    const b = bars[i];
    const cap = o.capture;
    return {
      netPct: pos ? net(pos.inPx, b.close) : NaN,
      barsInPos: pos ? i - pos.inIdx : NaN,
      minSinceCapture: cap ? (b.time - bars[cap.index].time) / 60 : NaN,
      gapPct: o.prevClose ? (bars[0].open / o.prevClose - 1) * 100 : NaN,
      capPct: cap ? (b.close / cap.price - 1) * 100 : NaN,
    };
  };
  const ctx: Ctx = {
    params: c.params,
    isPos: (name) => POS_VARS.includes(name),
    posVar: (name) => posVars()[name] ?? NaN,
    series: (name, j) => {
      if (j < 0 || j >= bars.length) return NaN;
      if (BAR_VARS.includes(name)) return (bars[j] as any)[name];
      const parts = name.split('.');
      const s = ind[parts[0]];
      const arr = s ? s[parts.length > 1 ? parts[1] : ''] : undefined;
      return arr ? arr[j] : NaN;
    },
  };
  const close = (outIdx: number, outPx: number, sigOut: number, reason: string) => {
    const p = pos!;
    let hi = -Infinity;
    for (let j = p.inIdx; j <= outIdx; j++) hi = Math.max(hi, bars[j].high);
    trades.push({
      sigIn: p.sigIn, inIdx: p.inIdx, inTime: bars[p.inIdx].time, inPx: p.inPx,
      sigOut, outIdx, outTime: bars[outIdx].time, outPx, reason,
      netPct: r4(net(p.inPx, outPx)), mfePct: r4((hi / p.inPx - 1) * 100),
    });
    signals.push({ i: outIdx, kind: 'SELL', reason });
    pos = null;
  };

  for (i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (pending) {
      if (pending.kind === 'BUY') {
        pos = { sigIn: pending.sig, inIdx: i, inPx: b.open + slip * krxTick(b.open) };
        traded = true;
        signals.push({ i, kind: 'BUY', reason: 'entry' });
      } else if (pos) {
        close(i, b.open - slip * krxTick(b.open), pending.sig, pending.reason);
      }
      pending = null;
    }
    if (pos && kstMin(b.time) >= tx) { close(i, b.open - slip * krxTick(b.open), i, 'Tx'); continue; }
    if (pos) {
      for (const x of c.exits) {
        if (truthy(evalAt(x.node, i, ctx))) {
          if (i === bars.length - 1) close(i, b.close, i, x.id + '-last');
          else pending = { kind: 'SELL', sig: i, reason: x.id };
          break;
        }
      }
    } else if ((c.def.reentry || !traded) && i < bars.length - 1 && kstMin(b.time) < tx && truthy(evalAt(c.entry, i, ctx))) {
      pending = { kind: 'BUY', sig: i, reason: 'entry' };
    }
  }
  if (pos) close(bars.length - 1, bars[bars.length - 1].close, bars.length - 1, 'eod');

  const sum = trades.reduce((a, t) => a + t.netPct, 0);
  return { trades, signals, n: trades.length, wins: trades.filter((t) => t.netPct > 0).length, sumNet: r4(sum), opts: { fee, tax, slip, tx: o.tx ?? '15:15' } };
}
