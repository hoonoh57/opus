// L03: formula engine self-test on synthetic bars (no Kiwoom access). docs/07 FX1-FX4, FM1, SV4.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { main, Rec, ROOT } from './common.ts';
import { compile, computeIndicators, run } from './lab/engine.ts';
import type { Bar } from './lab/indicators.ts';

function synth(seed: number, n: number): Bar[] {
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const bars: Bar[] = [];
  let px = 10000;
  let t = Date.UTC(2026, 10, 10, 0, 5, 0) / 1000;
  let drift = 0;
  for (let i = 0; i < n; i++) {
    if (i % 150 === 0) drift = (rnd() - 0.45) * 0.004;
    const o = px;
    const c = Math.max(100, o * (1 + drift + (rnd() - 0.5) * 0.006));
    const h = Math.max(o, c) * (1 + rnd() * 0.002);
    const l = Math.min(o, c) * (1 - rnd() * 0.002);
    bars.push({ time: t, open: o, high: h, low: l, close: c, volume: Math.floor(1000 + rnd() * 5000) });
    px = c;
    t += 10 + Math.floor(rnd() * 10);
  }
  return bars;
}

const same = (a: number, b: number) => (Number.isNaN(a) && Number.isNaN(b)) || a === b;

main('L03', async () => {
  const rec = new Rec('L03', 'local');
  try {
    const raw = readFileSync(join(ROOT, '..', 'lab', 'strategies', 'B0', 'v1.json'), 'utf8');
    const hash = createHash('sha256').update(raw).digest('hex').slice(0, 12);
    const def = JSON.parse(raw);
    const c = compile(def);
    rec.w('strategy', { id: def.id, version: def.version, hash });

    const bad = ['foo > 1', 'ref(close, -1) > 0', 'ref(close, close) > 0', 'close >', 'constructor(1)', 'process.exit > 0'];
    let rejected = 0;
    for (const f of bad) {
      try { compile({ ...def, entry: f }); rec.w('reject-miss', { f }); }
      catch (e: any) { rejected++; rec.w('reject', { f, msg: String(e.message).slice(0, 120) }); }
    }
    if (rejected !== bad.length) throw new Error('formula rejection ' + rejected + '/' + bad.length);

    const bars = synth(20261110, 1500);
    const full = computeIndicators(c, bars);
    const ks = [60, 333, 777, 1200];
    let causal = 0;
    for (const k of ks) {
      const part = computeIndicators(c, bars.slice(0, k + 1));
      let ok = true;
      for (const [name, s] of Object.entries(full)) {
        for (const [f, arr] of Object.entries(s)) {
          if (!same(arr[k], part[name][f][k])) { ok = false; rec.w('causal-diff', { k, name, f, full: arr[k], part: part[name][f][k] }); }
        }
      }
      if (ok) causal++;
    }
    if (causal !== ks.length) throw new Error('lookahead detected ' + causal + '/' + ks.length);

    const r1 = run(c, bars, {});
    const r2 = run(c, bars, {});
    if (JSON.stringify(r1) !== JSON.stringify(r2)) throw new Error('non-deterministic run');
    const badFill = r1.trades.filter((t) => t.inIdx !== t.sigIn + 1 ||
      !(t.outIdx === t.sigOut + 1 || t.reason === 'Tx' || t.reason === 'eod' || t.reason.endsWith('-last')));
    if (badFill.length) { rec.w('bad-fill', badFill.slice(0, 3)); throw new Error('fill model violation ' + badFill.length); }
    if (!r1.trades.length) throw new Error('no trades on synthetic data');
    const reasons: Record<string, number> = {};
    for (const t of r1.trades) reasons[t.reason] = (reasons[t.reason] || 0) + 1;
    rec.w('summary', { n: r1.n, wins: r1.wins, sumNet: r1.sumNet, reasons, opts: r1.opts });
    rec.w('trades', r1.trades.slice(0, 10));
    return 'L03 OK strategy=B0/v1#' + hash + ' reject=' + rejected + '/' + bad.length + ' causal=' + causal + '/' + ks.length +
      ' fill=ok determinism=ok trades=' + r1.n + ' exits=' + Object.entries(reasons).map(([k, v]) => k + ':' + v).join(',') +
      ' (synthetic; fee=0.015 slip=1tick tx=15:15 are W)';
  } finally {
    rec.close();
  }
});
