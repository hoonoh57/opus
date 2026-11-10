// L04: day mode D (docs/07 3). Offline, no Kiwoom access.
// For every capture date that has L02 tick files: build n-tick candles (KRX 09:00:00-15:30:59),
// run the champion strategy per captured stock, write chart data (measure/lab-data/chart, local)
// and run records (lab/runs/<runId>, committed). Entries only on candles that start after the
// capture bar ends (capture 09:05 -> from 09:06:00). Indicators use the whole day for warm-up.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { main, Rec, ROOT } from './common.ts';
import { compile, computeIndicators, run } from './lab/engine.ts';
import type { Bar } from './lab/indicators.ts';

const REPO = join(ROOT, '..');
const CAPS = join(REPO, 'lab', 'captures');
const TICKS = join(ROOT, 'lab-data', 'ticks');
const CHART = join(ROOT, 'lab-data', 'chart');
const RUNS = join(REPO, 'lab', 'runs');
const HI_MFE = 10;
const r2 = (x: number) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const r4 = (x: number) => Math.round(x * 10000) / 10000;

function epoch(ymd: string, hms: string): number {
  return Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)),
    Number(hms.slice(0, 2)) - 9, Number(hms.slice(2, 4)), Number(hms.slice(4, 6))) / 1000;
}

function rows(p: string): string[][] {
  return readFileSync(p, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim()).slice(1).map((l) => l.split(','));
}

function plus1(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(2, 4)) + 1;
  return String(h + Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0');
}

function captures(date: string) {
  const lines = readFileSync(join(CAPS, 'capture_' + date + '.csv'), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split(',');
  const ix = (n: string) => head.indexOf(n);
  const iT = ix('시각'), iC = ix('종목코드'), iN = ix('종목명'), iM = ix('MFE');
  if (iT < 0 || iC < 0) throw new Error('capture header unexpected: ' + date);
  const all = lines.slice(1).map((l) => {
    const c = l.split(',');
    const m = iM >= 0 && c[iM] ? Number(c[iM]) : NaN;
    return { time: c[iT], code: c[iC], name: iN >= 0 ? c[iN] : '', mfeUser: Number.isFinite(m) ? m : null };
  }).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
  const seen = new Set<string>();
  return all.filter((x) => (seen.has(x.code) ? false : (seen.add(x.code), true)));
}

function tickBars(date: string, file: string, n: number) {
  const bars: Bar[] = [];
  const hms: string[] = [];
  let cur: Bar | null = null;
  let k = 0;
  for (const r of rows(file)) {
    const t = String(r[0]).padStart(6, '0');
    if (t < '090000' || t > '153059') continue;
    const p = Math.abs(Number(r[1]));
    const q = Math.abs(Number(r[2])) || 0;
    if (!p) continue;
    if (!cur) { cur = { time: epoch(date, t), open: p, high: p, low: p, close: p, volume: 0 }; hms.push(t); k = 0; }
    if (p > cur.high) cur.high = p;
    if (p < cur.low) cur.low = p;
    cur.close = p;
    cur.volume += q;
    k++;
    if (k >= n) { bars.push(cur); cur = null; }
  }
  if (cur) bars.push(cur);
  return { bars, hms };
}

// MF1 (07 1): max 1-min close after the capture bar until 15:30, over the capture bar close
function mf1(file: string, hhmm: string) {
  const b = rows(file).map((r) => ({ t: String(r[0]).padStart(6, '0'), c: Math.abs(Number(r[4])) }));
  const i = b.findIndex((x) => x.t.slice(0, 4) === hhmm);
  if (i < 0 || !b[i].c) return { base: NaN, hi: NaN, mfe: NaN };
  let hi = -Infinity;
  for (let k = i + 1; k < b.length; k++) if (b[k].t.slice(0, 4) <= '1530' && b[k].c > hi) hi = b[k].c;
  return { base: b[i].c, hi, mfe: hi > 0 ? (hi / b[i].c - 1) * 100 : NaN };
}

main('L04', async () => {
  const rec = new Rec('L04', 'local');
  try {
    const champ = String(JSON.parse(readFileSync(join(REPO, 'lab', 'champion.json'), 'utf8')).champion);
    const [sid, sv] = champ.split('/');
    const raw = readFileSync(join(REPO, 'lab', 'strategies', sid, sv + '.json'), 'utf8');
    const hash = createHash('sha256').update(raw).digest('hex').slice(0, 12);
    const def = JSON.parse(raw);
    if (def.candle?.type !== 'tick') throw new Error('L04 supports tick candles only: ' + champ);
    const n = Number(def.candle?.n) || 120;
    const c = compile(def);
    const strategy = champ + '#' + hash;
    if (!existsSync(CAPS) || !existsSync(TICKS)) throw new Error('no captures or ticks (run L02 first)');
    const dates = readdirSync(CAPS).map((f) => (f.match(/^capture_(\d{8})\.csv$/) || [])[1])
      .filter((d): d is string => !!d && existsSync(join(TICKS, d))).sort();
    if (!dates.length) throw new Error('no capture date with L02 ticks');
    let nS = 0, nT = 0, sum = 0, hiN = 0, hiSum = 0, skipped = 0;
    for (const date of dates) {
      const outDir = join(CHART, date);
      mkdirSync(outDir, { recursive: true });
      const items: any[] = [];
      const per: any[] = [];
      const tcsv: string[] = ['code,name,inTime,inPx,outTime,outPx,reason,netPct,mfeSinceEntryPct'];
      let dSum = 0, dN = 0, dHiN = 0, dHiSum = 0;
      let opts: any = null;
      for (const cp of captures(date)) {
        const tf = join(TICKS, date, cp.code + '_tick.csv');
        const mf = join(TICKS, date, cp.code + '_1m.csv');
        if (!existsSync(tf) || !existsSync(mf)) { skipped++; rec.w('skip', { date, code: cp.code, why: 'no tick or 1m file' }); continue; }
        const hhmm = cp.time.replace(':', '').slice(0, 4);
        const from = plus1(hhmm) + '00';
        const { bars, hms } = tickBars(date, tf, n);
        const entryFrom = hms.findIndex((t) => t >= from);
        const m = mf1(mf, hhmm);
        if (entryFrom < 0 || !Number.isFinite(m.base)) { skipped++; rec.w('skip', { date, code: cp.code, why: 'no candle after capture or no capture bar' }); continue; }
        const r = run(c, bars, { capture: { index: entryFrom, price: m.base }, entryFrom });
        opts = r.opts;
        const ind = computeIndicators(c, bars);
        const indOut: Record<string, Record<string, (number | null)[]>> = {};
        for (const [k, s] of Object.entries(ind)) {
          indOut[k] = {};
          for (const [f, a] of Object.entries(s)) indOut[k][f] = a.map((v) => r2(v));
        }
        const time: number[] = [];
        let prev = 0;
        for (const b of bars) { const t = Math.max(b.time + 9 * 3600, prev + 1); time.push(t); prev = t; }
        const trades = r.trades.map((t) => ({ ...t, inHms: hms[t.inIdx], outHms: hms[t.outIdx] }));
        const mfe = r2(m.mfe);
        const hi = Number.isFinite(m.mfe) && m.mfe >= HI_MFE;
        const firstTick = hms[0] || '';
        const complete = firstTick !== '' && firstTick <= '090100';
        writeFileSync(join(outDir, cp.code + '.json'), JSON.stringify({
          date, code: cp.code, name: cp.name, strategy, candleN: n, time, hms,
          candles: bars.map((b) => [b.open, b.high, b.low, b.close, b.volume]), ind: indOut,
          momTh: c.params.mom_th ?? null, capIdx: entryFrom, capTime: cp.time, capPrice: m.base,
          mfe, mfeUser: cp.mfeUser, mfePrice: Number.isFinite(m.hi) ? m.hi : null,
          trades, sumNet: r.sumNet, opts: r.opts, complete, firstTick,
        }));
        items.push({ date, code: cp.code, name: cp.name, mfe, hi, n: r.n, sumNet: r.sumNet, complete, firstTick });
        per.push({ code: cp.code, name: cp.name, capTime: cp.time, mfe, hiMfe: hi, trades: r.n, wins: r.wins, sumNet: r.sumNet, candles: bars.length, complete });
        for (const t of trades) tcsv.push([cp.code, cp.name, t.inHms, r2(t.inPx), t.outHms, r2(t.outPx), t.reason, t.netPct, t.mfePct].join(','));
        rec.w('stock', { date, code: cp.code, mfe, hi, n: r.n, sumNet: r.sumNet, complete });
        dSum += r.sumNet; dN += r.n; nS++;
        if (hi) { dHiN++; dHiSum += r.sumNet; }
      }
      writeFileSync(join(outDir, 'index.json'), JSON.stringify({ date, strategy, items }));
      const runId = 'D_' + date + '_' + sid + sv + '_' + hash.slice(0, 6) + '_t' + n;
      const rd = join(RUNS, runId);
      mkdirSync(rd, { recursive: true });
      writeFileSync(join(rd, 'summary.json'), JSON.stringify({
        runId, mode: 'D', date, strategy, candle: def.candle, opts, dataClass: 'precise (tick)',
        entryRule: 'entries only on candles starting after the capture bar ends', mfeDef: 'MF1',
        cases: per.length, trades: dN, sumNet: r4(dSum), hiMfeCases: dHiN, hiMfeSumNet: r4(dHiSum), perStock: per,
      }, null, 2) + '\n');
      writeFileSync(join(rd, 'trades.csv'), tcsv.join('\n') + '\n');
      sum += dSum; nT += dN; hiN += dHiN; hiSum += dHiSum;
    }
    return 'L04 OK dates=' + dates.length + ' stocks=' + nS + ' skipped=' + skipped + ' trades=' + nT + ' sumNet=' + r4(sum) +
      ' hiMfe=' + hiN + ' hiMfeSumNet=' + r4(hiSum) + ' strategy=' + strategy + ' candle=' + n + 'tick (fee/slip/tx are W)';
  } finally {
    rec.close();
  }
});
