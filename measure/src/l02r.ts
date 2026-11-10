// L02R: offline MFE definition reconcile (docs/07). No Kiwoom access.
// Reads the latest lab/captures file and lab-data/ticks/<date>, tries 36 MFE definitions,
// and ranks them by how many user MFE labels (from the performance-check app) they reproduce.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { main, Rec, ROOT } from './common.ts';

const CAPS = join(ROOT, '..', 'lab', 'captures');
type Bar = { t: string; h: number; c: number };
type Tick = { t: string; p: number };
type Case = { code: string; time: string; price: number; mfe: number; bars: Bar[]; ticks: Tick[] };

function rowsOf(p: string): string[][] {
  return readFileSync(p, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(','));
}

function plus1(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(2, 4)) + 1;
  return String(h + Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0');
}

main('L02R', async () => {
  if (!existsSync(CAPS)) throw new Error('no lab/captures folder');
  const fs = readdirSync(CAPS).filter((f) => /^capture_\d{8}\.csv$/.test(f)).sort();
  if (!fs.length) throw new Error('no capture_YYYYMMDD.csv in lab/captures');
  const f = fs[fs.length - 1];
  const date = f.slice(8, 16);
  const cap = rowsOf(join(CAPS, f));
  const head = cap[0];
  const iT = head.indexOf('시각'), iC = head.indexOf('종목코드'), iP = head.indexOf('포착가'), iM = head.indexOf('MFE');
  if (iT < 0 || iC < 0 || iM < 0) throw new Error('capture header needs 시각, 종목코드, MFE (re-save in capture input tab)');
  const dir = join(ROOT, 'lab-data', 'ticks', date);
  if (!existsSync(dir)) throw new Error('no lab-data/ticks/' + date + ' (run L02 first)');
  const rec = new Rec('L02R', 'local');
  try {
    const cases: Case[] = [];
    for (const c of cap.slice(1)) {
      const mfe = Number(c[iM]);
      if (c[iM] === undefined || c[iM] === '' || isNaN(mfe)) continue;
      const code = c[iC];
      const bp = join(dir, code + '_1m.csv');
      const tp = join(dir, code + '_tick.csv');
      if (!existsSync(bp)) throw new Error('missing ' + code + '_1m.csv (run L02 first)');
      const bars = rowsOf(bp).slice(1).map((x) => ({ t: x[0], h: Number(x[2]), c: Number(x[4]) }));
      const ticks = existsSync(tp) ? rowsOf(tp).slice(1).map((x) => ({ t: x[0], p: Number(x[1]) })) : [];
      cases.push({ code, time: c[iT], price: iP >= 0 ? Number(c[iP]) || 0 : 0, mfe, bars, ticks });
    }
    if (!cases.length) throw new Error('no capture rows with MFE label');
    const res: { v: string; match: number; n: number; mae: number; per: object[] }[] = [];
    for (const base of ['P', 'A', 'B']) for (const start of ['incl', 'excl']) for (const end of ['1530', 'all']) for (const src of ['H', 'C', 'T']) {
      let match = 0, n = 0, err = 0;
      const per: object[] = [];
      for (const k of cases) {
        const hm = k.time.replace(':', '');
        let bp = 0;
        if (base === 'P') bp = k.price;
        else {
          const want = base === 'A' ? hm : plus1(hm);
          const b = k.bars.find((x) => x.t.slice(0, 4) === want);
          bp = b ? b.c : 0;
        }
        const from = (start === 'incl' ? hm : plus1(hm)) + '00';
        const inWin = (t: string) => t >= from && (end === 'all' || t <= '153059');
        let hi = 0;
        if (src === 'T') { for (const x of k.ticks) if (inWin(x.t) && x.p > hi) hi = x.p; }
        else { for (const b of k.bars) if (inWin(b.t)) { const v = src === 'H' ? b.h : b.c; if (v > hi) hi = v; } }
        const v = bp > 0 && hi > 0 ? Math.round((hi / bp - 1) * 10000) / 100 : null;
        per.push({ code: k.code, user: k.mfe, calc: v, base: bp, high: hi });
        if (v !== null) { n++; err += Math.abs(v - k.mfe); if (Math.abs(v - k.mfe) <= 0.06) match++; }
      }
      res.push({ v: base + '/' + start + '/' + end + '/' + src, match, n, mae: n ? Math.round((err / n) * 100) / 100 : 99, per });
    }
    res.sort((a, b) => b.match - a.match || a.mae - b.mae);
    rec.w('legend', { base: 'P=input capture price, A=close of hhmm bar, B=close of hhmm+1 bar', start: 'incl=from hhmm bar, excl=from next bar', end: '1530=regular session only, all=incl. after-hours', src: 'H=1m high, C=1m close, T=tick max' });
    rec.w('ranking', { top: res.slice(0, 12).map((r) => r.v + ' ' + r.match + '/' + r.n + ' mae ' + r.mae) });
    for (const r of res.slice(0, 4)) rec.w('variant', r);
    const a = res[0], b = res[1];
    return 'L02R OK date=' + date + ' cases=' + cases.length + ' best=' + a.v + ' ' + a.match + '/' + a.n + ' mae=' + a.mae +
      ' 2nd=' + b.v + ' ' + b.match + '/' + b.n + ' mae=' + b.mae;
  } finally {
    rec.close();
  }
});
