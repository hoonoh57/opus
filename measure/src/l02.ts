// L02: collect ticks (ka10079) and 1-min bars (ka10080) for the latest capture file,
// then reconcile MFE computed from 1-min bars with the user's MFE label. docs/07.
// Read-only queries, no orders. Data goes to lab-data/ticks (not committed: size).
// Response field names (cntr_tm, cur_prc, open_pric, high_pric, low_pric, trde_qty) are unverified:
// the first page shape of each TR is recorded in the ledger details.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { main, requireEnv, Rec, issue, REST, ROOT, sleep, Env } from './common.ts';

const CAPS = join(ROOT, '..', 'lab', 'captures');
type Row = Record<string, unknown>;
type Bar = { t: string; o: number; h: number; l: number; c: number; v: number };
const num = (v: unknown) => Math.abs(Number(String(v ?? '').replace(/[,+\s]/g, '')) || 0);

let lastCall = 0;
async function pace() {
  const w = lastCall + 1100 - Date.now();
  if (w > 0) await sleep(w);
  lastCall = Date.now();
}

async function call(env: Env, token: string, apiId: string, body: object, next: string) {
  const h: Record<string, string> = { 'content-type': 'application/json;charset=UTF-8', authorization: 'Bearer ' + token, 'api-id': apiId };
  if (next) { h['cont-yn'] = 'Y'; h['next-key'] = next; }
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), 15000);
  try {
    const r = await fetch(REST[env] + '/api/dostk/chart', { method: 'POST', headers: h, body: JSON.stringify(body), signal: ac.signal });
    const text = await r.text();
    let j: any = {};
    try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text.slice(0, 200) }; }
    return { http: r.status, j, cont: r.headers.get('cont-yn') === 'Y', next: r.headers.get('next-key') || '' };
  } finally {
    clearTimeout(tm);
  }
}

async function paged(rec: Rec, env: Env, token: string, apiId: string, body: object, listKey: string, ymd: string, maxPages: number, shape: boolean) {
  const rows: Row[] = [];
  let next = '';
  let pages = 0;
  let done = false;
  while (pages < maxPages) {
    let r: any;
    let tries = 0;
    for (;;) {
      await pace();
      r = await call(env, token, apiId, body, next);
      const msg = String(r.j?.return_msg ?? '');
      const code = (msg.match(/\[(\d{4}):/) || [])[1] || '';
      if (code === '1700' && tries < 3) { tries++; rec.w('throttle', { apiId, tries }); await sleep(2000 * tries); continue; }
      if (r.http !== 200 || Number(r.j?.return_code) !== 0) {
        rec.w('error', { apiId, http: r.http, rc: r.j?.return_code, msg: msg.slice(0, 200) });
        throw new Error(apiId + ' http ' + r.http + ' rc ' + r.j?.return_code + ' ' + msg.slice(0, 80));
      }
      break;
    }
    pages++;
    const list: Row[] = Array.isArray(r.j[listKey]) ? r.j[listKey] : [];
    if (pages === 1 && shape) {
      rec.w('shape', { apiId, keys: Object.keys(r.j), rowKeys: list[0] ? Object.keys(list[0]) : [], sample: list.slice(0, 2), cont: r.cont });
    }
    let older = false;
    for (const x of list) {
      const d = String(x.cntr_tm ?? '').slice(0, 8);
      if (d === ymd) rows.push(x);
      else if (d < ymd) older = true;
    }
    if (older || !r.cont || !r.next || !list.length) { done = true; break; }
    next = r.next;
  }
  rows.reverse();
  rows.sort((a, b) => (String(a.cntr_tm) < String(b.cntr_tm) ? -1 : String(a.cntr_tm) > String(b.cntr_tm) ? 1 : 0));
  return { rows, pages, done };
}

function latestCapture() {
  if (!existsSync(CAPS)) throw new Error('no lab/captures folder (save in capture input tab first)');
  const fs = readdirSync(CAPS).filter((f) => /^capture_\d{8}\.csv$/.test(f)).sort();
  if (!fs.length) throw new Error('no capture_YYYYMMDD.csv in lab/captures');
  const f = fs[fs.length - 1];
  const lines = readFileSync(join(CAPS, f), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split(',');
  const ix = (n: string) => head.indexOf(n);
  const iD = ix('일자'), iT = ix('시각'), iC = ix('종목코드'), iM = ix('MFE');
  if (iD < 0 || iT < 0 || iC < 0) throw new Error('capture header unexpected');
  const rows = lines.slice(1).map((l) => {
    const c = l.split(',');
    return { date: c[iD], time: c[iT], code: c[iC], mfe: iM >= 0 ? (c[iM] || '') : '' };
  });
  return { date: f.slice(8, 16), rows };
}

// MFE: base = close of the bar labelled hhmm, high = max high of later bars, in percent
function mfeAt(bars: Bar[] | undefined, hhmm: string): number | null {
  if (!bars) return null;
  const i = bars.findIndex((b) => b.t.slice(0, 4) === hhmm);
  if (i < 0) return null;
  const base = bars[i].c;
  let hi = 0;
  for (let k = i + 1; k < bars.length; k++) if (bars[k].h > hi) hi = bars[k].h;
  return base > 0 && hi > 0 ? Math.round((hi / base - 1) * 10000) / 100 : null;
}

function plus1(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(2, 4)) + 1;
  return String(h + Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0');
}

main('L02', async () => {
  const env = requireEnv(['mock', 'real']);
  const cap = latestCapture();
  const rec = new Rec('L02', env);
  try {
    const tok = await issue(env, rec);
    const out = join(ROOT, 'lab-data', 'ticks', cap.date);
    mkdirSync(out, { recursive: true });
    const codes = [...new Set(cap.rows.map((r) => r.code))];
    const bars: Record<string, Bar[]> = {};
    const tickN: Record<string, number> = {};
    let nt = 0, nb = 0, full = 0, first = true;
    for (const code of codes) {
      const m = await paged(rec, env, tok.token, 'ka10080', { stk_cd: code, tic_scope: '1', upd_stkpc_tp: '1' }, 'stk_min_pole_chart_qry', cap.date, 5, first);
      const b: Bar[] = m.rows.map((x) => ({ t: String(x.cntr_tm).slice(8, 14), o: num(x.open_pric), h: num(x.high_pric), l: num(x.low_pric), c: num(x.cur_prc), v: num(x.trde_qty) }));
      if (!b.length) throw new Error('ka10080 no rows for ' + code + ' on ' + cap.date + ' (see shape in ledger details)');
      bars[code] = b;
      nb += b.length;
      writeFileSync(join(out, code + '_1m.csv'), 'time,open,high,low,close,qty\n' + b.map((x) => [x.t, x.o, x.h, x.l, x.c, x.v].join(',')).join('\n') + '\n');
      const k = await paged(rec, env, tok.token, 'ka10079', { stk_cd: code, tic_scope: '1', upd_stkpc_tp: '1' }, 'stk_tic_chart_qry', cap.date, 400, first);
      const t = k.rows.map((x) => [String(x.cntr_tm).slice(8, 14), num(x.cur_prc), num(x.trde_qty)].join(','));
      if (!t.length) throw new Error('ka10079 no rows for ' + code + ' on ' + cap.date + ' (see shape in ledger details)');
      tickN[code] = t.length;
      nt += t.length;
      if (k.done) full++;
      writeFileSync(join(out, code + '_tick.csv'), 'time,price,qty\n' + t.join('\n') + '\n');
      rec.w('stock', { code, bars: b.length, ticks: t.length, tickPages: k.pages, tickComplete: k.done, firstTick: t[0].slice(0, 6), lastTick: t[t.length - 1].slice(0, 6) });
      first = false;
    }
    let labeled = 0, okA = 0, okB = 0;
    for (const r of cap.rows) {
      const hm = r.time.replace(':', '');
      const a = mfeAt(bars[r.code], hm);
      const b = mfeAt(bars[r.code], plus1(hm));
      const u = r.mfe === '' ? null : Number(r.mfe);
      if (u !== null && !isNaN(u)) {
        labeled++;
        if (a !== null && Math.abs(a - u) <= 0.3) okA++;
        if (b !== null && Math.abs(b - u) <= 0.3) okB++;
      }
      rec.w('mfe', { code: r.code, time: r.time, user: u, A_bar_hhmm: a, B_bar_hhmm_plus1: b, ticks: tickN[r.code] });
    }
    return 'L02 OK env=' + env + ' date=' + cap.date + ' stocks=' + codes.length + ' bars=' + nb + ' ticks=' + nt +
      ' tickComplete=' + full + '/' + codes.length + ' mfeLabeled=' + labeled + ' matchA=' + okA + ' matchB=' + okB;
  } finally {
    rec.close();
  }
});
