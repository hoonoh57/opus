// opus lab console. Local only (127.0.0.1). Not the kernel.
// Runs only scripts registered in steps.json, appends results to results/ledger.jsonl and commits that file.
import http from 'node:http';
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync, mkdirSync, unlinkSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const MEASURE = join(HERE, '..');
const REPO = join(MEASURE, '..');
const PORT = 3020;
const LEDGER = join(MEASURE, 'results', 'ledger.jsonl');
const LEDGER_REL = 'measure/results/ledger.jsonl';
const PIDF = join(MEASURE, 'lab-data', 'console.pid');
const TSX = join(MEASURE, 'node_modules', 'tsx', 'dist', 'cli.mjs');

let run = null;
let share = { ok: true, msg: '' };
let own = false;

const steps = () => JSON.parse(readFileSync(join(HERE, 'steps.json'), 'utf8'));
const kstNow = () => new Date(Date.now() + 9 * 3600000);

function ledger() {
  if (!existsSync(LEDGER)) return [];
  return readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function blockedNow(rule) {
  if (rule !== 'afterHours') return '';
  const d = kstNow();
  const dow = d.getUTCDay();
  const hm = d.getUTCHours() * 100 + d.getUTCMinutes();
  return dow >= 1 && dow <= 5 && hm >= 800 && hm < 1540 ? '평일 08:00~15:40에는 실행할 수 없습니다 (15:40 이후 가능)' : '';
}

function git(args) {
  return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function shareLedger(msg) {
  const paths = [LEDGER_REL, 'lab/captures'].filter((p) => existsSync(join(REPO, p)));
  try {
    if (paths.length && git(['status', '--porcelain', '--', ...paths])) {
      git(['add', '--', ...paths]);
      git(['commit', '-q', '-m', msg, '--', ...paths]);
    }
    git(['push', '-q']);
    share = { ok: true, msg: git(['rev-parse', '--short', 'HEAD']) };
  } catch (e) {
    share = { ok: false, msg: String((e && (e.stderr || e.message)) || e).replace(/\s+/g, ' ').slice(0, 200) };
  }
}

function details(exp, since) {
  const base = join(MEASURE, 'lab-data', 'measure');
  if (!existsSync(base)) return [];
  let best = null;
  for (const d of readdirSync(base)) {
    const dir = join(base, d);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (!f.startsWith(exp + '-')) continue;
      const p = join(dir, f);
      const t = statSync(p).mtimeMs;
      if (t >= since - 2000 && (!best || t > best.t)) best = { p, t };
    }
  }
  if (!best) return [];
  return readFileSync(best.p, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { const o = JSON.parse(l); return o.kind === 'head' ? null : Object.assign({ kind: o.kind }, o.body); } catch { return null; }
  }).filter(Boolean).slice(-15);
}

function startRun(b) {
  if (run) return '이미 실행 중입니다: ' + run.id;
  const s = steps().steps.find((x) => x.id === b.id);
  if (!s) return '등록되지 않은 단계: ' + b.id;
  if (!/^src\/[a-z0-9_-]+\.ts$/.test(s.script)) return '허용되지 않은 스크립트';
  const blk = blockedNow(s.rule);
  if (blk) return blk;
  if (!existsSync(TSX)) return 'tsx가 없습니다. stop.cmd 후 start.cmd를 다시 실행하세요';
  const env = String(b.env || '');
  const args = [TSX, s.script];
  if (s.envs.length) {
    if (!s.envs.includes(env)) return '허용되지 않은 환경: ' + env;
    if (!b.ack) return '같은 앱키를 쓰는 프로그램을 종료했는지 확인이 필요합니다 (MT5)';
    args.push('--env', env);
    if (env === 'real') {
      if (!b.confirm) return '실전 실행 확인이 필요합니다 (MT6)';
      args.push('--confirm', 'REAL');
    }
  }
  const r = { id: s.id, env, started: Date.now(), out: '', err: '', child: null };
  run = r;
  const p = spawn(process.execPath, args, { cwd: MEASURE, windowsHide: true });
  r.child = p;
  p.stdout.on('data', (d) => { r.out += d; });
  p.stderr.on('data', (d) => { r.err = (r.err + d).slice(-2000); });
  p.on('error', (e) => { r.err += ' ' + e.message; });
  const timer = setTimeout(() => { try { p.kill(); } catch { /* gone */ } }, 20 * 60000);
  p.on('close', (code) => {
    clearTimeout(timer);
    const lines = r.out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const line = lines.length ? lines[lines.length - 1]
      : s.id + ' FAIL no output, exit ' + code + ' ' + r.err.replace(/\s+/g, ' ').slice(-200);
    const ok = line.startsWith(s.id + ' OK');
    const e = {
      at: new Date().toISOString(), kst: kstNow().toISOString().slice(0, 19).replace('T', ' '),
      step: s.id, env, ok, line, details: details(s.id, r.started), src: 'console',
    };
    mkdirSync(dirname(LEDGER), { recursive: true });
    appendFileSync(LEDGER, JSON.stringify(e) + '\n');
    run = null;
    shareLedger('lab: ' + s.id + (env ? ' ' + env : '') + (ok ? ' OK' : ' FAIL'));
  });
  return '';
}

// capture input tab: user pastes, the app owns location and file names
const INBOX = join(MEASURE, 'lab-data', 'inbox');
const INBOX_BAK = join(MEASURE, 'lab-data', 'inbox-bak');
const CAPS = join(REPO, 'lab', 'captures');
const CAP_COLS = [
  ['date', '일자', ['일자', '날짜', '포착일', '포착일자', 'date']],
  ['time', '시각', ['시각', '시간', '포착시각', '포착시간', 'time']],
  ['code', '종목코드', ['종목코드', '코드', '단축코드', 'code']],
  ['name', '종목명', ['종목명', 'name']],
  ['price', '포착가', ['포착가', '현재가', '종가', '가격', 'price']],
  ['cond', '조건식', ['조건식', '조건명', 'condition']],
];
function capSplit(l) {
  if (l.includes('\t')) return l.split('\t').map((x) => x.trim().replace(/^"|"$/g, ''));
  const out = []; let cur = ''; let q = false;
  for (const ch of l) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
function capParse(text, cond) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const errs = []; const warns = []; const rows = []; const seen = new Set();
  if (!lines.length) return { errs: ['입력이 비어 있습니다'], warns, rows };
  let col = {}; let start = 0;
  const head = capSplit(lines[0]).map((h) => h.toLowerCase());
  for (const [k, , names] of CAP_COLS) {
    const i = head.findIndex((h) => names.some((x) => x.toLowerCase() === h));
    if (i >= 0) col[k] = i;
  }
  if (col.date !== undefined || col.code !== undefined) {
    start = 1;
    for (const k of ['date', 'time', 'code']) if (col[k] === undefined) errs.push('머리글에 ' + CAP_COLS.find((c) => c[0] === k)[1] + ' 열이 없습니다');
    if (errs.length) return { errs, warns, rows };
  } else {
    col = { date: 0, time: 1, code: 2, name: 3, price: 4, cond: 5 };
    warns.push('머리글이 없어 일자, 시각, 종목코드, 종목명, 포착가, 조건식 순서로 읽었습니다');
  }
  for (let i = start; i < lines.length; i++) {
    const c = capSplit(lines[i]); const at = (i + 1) + '번째 줄: ';
    const g = (k) => (col[k] === undefined ? '' : (c[col[k]] || '').trim());
    const date = g('date').replace(/[^0-9]/g, '');
    if (!/^20\d{6}$/.test(date)) { errs.push(at + '일자 "' + g('date') + '" (예: 20261110)'); continue; }
    let t = g('time').replace(/[^0-9]/g, '');
    if (t.length === 3 || t.length === 5) t = '0' + t;
    t = t.slice(0, 4);
    const hm = Number(t);
    if (t.length !== 4 || hm < 800 || hm > 2000 || hm % 100 > 59) { errs.push(at + '시각 "' + g('time') + '" (예: 09:05)'); continue; }
    let code = g('code').toUpperCase().replace(/\s/g, '').replace(/^A(?=[0-9A-Z]{6}$)/, '');
    if (/^\d{1,5}$/.test(code)) { warns.push(at + '종목코드 ' + code + ' -> ' + code.padStart(6, '0') + ' (앞자리 0 복원)'); code = code.padStart(6, '0'); }
    if (!/^[0-9A-Z]{6}$/.test(code)) { errs.push(at + '종목코드 "' + g('code') + '" (6자리)'); continue; }
    const pr = g('price').replace(/[,\s+-]/g, '');
    if (pr && !/^\d+$/.test(pr)) { errs.push(at + '포착가 "' + g('price') + '" (숫자만)'); continue; }
    const key = date + t + code;
    if (seen.has(key)) { warns.push(at + '중복 제외 ' + code); continue; }
    seen.add(key);
    const clean = (s) => String(s).replace(/[,"\t]/g, ' ').trim();
    rows.push({ date, time: t.slice(0, 2) + ':' + t.slice(2), code, name: clean(g('name')), price: pr, cond: clean(g('cond') || cond || '') });
  }
  if (!rows.length && !errs.length) errs.push('데이터 줄이 없습니다');
  return { errs, warns, rows };
}
function capCsv(rows) {
  return '일자,시각,종목코드,종목명,포착가,조건식\n' + rows.map((r) => [r.date, r.time, r.code, r.name, r.price, r.cond].join(',')).join('\n') + '\n';
}
function capCheck(b) {
  const p = capParse(b.text, b.cond);
  const dates = [...new Set(p.rows.map((r) => r.date))].sort();
  return { errs: p.errs, warns: p.warns, n: p.rows.length, dates, rows: p.rows, preview: capCsv(p.rows.slice(0, 5)) };
}
function capSave(b) {
  const r = capCheck(b);
  if (r.errs.length) return { errs: r.errs, warns: r.warns, n: r.n, dates: r.dates };
  mkdirSync(INBOX, { recursive: true });
  const files = [];
  const stamp = kstNow().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  for (const d of r.dates) {
    const name = 'capture_' + d + '.csv';
    const p = join(INBOX, name);
    if (existsSync(p)) { mkdirSync(INBOX_BAK, { recursive: true }); copyFileSync(p, join(INBOX_BAK, stamp + '_' + name)); }
    const body = '\uFEFF' + capCsv(r.rows.filter((x) => x.date === d));
    writeFileSync(p, body, 'utf8');
    mkdirSync(CAPS, { recursive: true });
    writeFileSync(join(CAPS, name), body, 'utf8');
    files.push(name);
  }
  shareLedger('lab: capture ' + r.dates.join(' '));
  return { errs: [], warns: r.warns, n: r.n, dates: r.dates, files, preview: r.preview, share };
}
function capLoad(b) {
  const f = String(b.file || '');
  if (!/^[^\\/:*?"<>|]+\.(csv|tsv|txt)$/i.test(f) || f.includes('..')) return { err: '허용되지 않은 파일 이름' };
  const p = join(INBOX, f);
  if (!existsSync(p)) return { err: '파일이 없습니다: ' + f };
  const buf = readFileSync(p);
  let s = new TextDecoder('utf-8').decode(buf);
  if (s.includes('\uFFFD')) s = new TextDecoder('euc-kr').decode(buf);
  return { text: s.replace(/^\uFEFF/, '') };
}
function inboxList() {
  if (!existsSync(INBOX)) return [];
  return readdirSync(INBOX).filter((f) => /\.(csv|tsv|txt)$/i.test(f)).map((f) => {
    const p = join(INBOX, f); let n = 0;
    try { n = readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim()).length - 1; } catch { /* unreadable */ }
    return { f, n, t: new Date(statSync(p).mtimeMs + 9 * 3600000).toISOString().slice(0, 16).replace('T', ' ') };
  }).sort((a, b) => (a.f < b.f ? 1 : -1));
}

function state() {
  const st = steps();
  const blocked = {};
  for (const s of st.steps) blocked[s.id] = blockedNow(s.rule);
  return {
    steps: st, ledger: ledger().slice(-300), share, blocked, inbox: inboxList(),
    run: run ? { id: run.id, env: run.env, sec: Math.round((Date.now() - run.started) / 1000) } : null,
    now: kstNow().toISOString().slice(11, 19),
  };
}

const server = http.createServer((req, res) => {
  const send = (code, body, type) => {
    res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(type ? body : JSON.stringify(body));
  };
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      return send(200, readFileSync(join(HERE, 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && req.url === '/api/state') return send(200, state());
    if (req.method !== 'POST') return send(404, { err: 'not found' });
    if (req.headers['x-opus'] !== '1') return send(403, { err: 'forbidden' });
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 3000000) req.destroy(); });
    req.on('end', () => {
      let b = {};
      try { b = raw ? JSON.parse(raw) : {}; } catch { return send(400, { err: 'bad json' }); }
      if (req.url === '/api/run') { const e = startRun(b); return send(200, e ? { err: e } : { ok: true }); }
      if (req.url === '/api/share') { shareLedger('lab: share retry'); return send(200, share); }
      const cap = (fn) => { try { const r = fn(b); delete r.rows; return send(200, r); } catch (e) { return send(200, { err: String((e && e.message) || e) }); } };
      if (req.url === '/api/capture/check') return cap(capCheck);
      if (req.url === '/api/capture/save') return cap(capSave);
      if (req.url === '/api/capture/load') return cap(capLoad);
      if (req.url === '/api/stop') { send(200, { ok: true }); setTimeout(() => process.exit(0), 200); return; }
      send(404, { err: 'not found' });
    });
  } catch (e) {
    send(500, { err: String((e && e.message) || e) });
  }
});

server.on('error', (e) => {
  console.log(e.code === 'EADDRINUSE' ? 'opus lab already running on ' + PORT : 'server error ' + e.message);
  process.exit(0);
});
server.listen(PORT, '127.0.0.1', () => {
  mkdirSync(dirname(PIDF), { recursive: true });
  writeFileSync(PIDF, String(process.pid));
  own = true;
  console.log('opus lab http://127.0.0.1:' + PORT + '  (stop.cmd to stop)');
});
process.on('exit', () => {
  if (run && run.child) { try { run.child.kill(); } catch { /* gone */ } }
  if (own) { try { unlinkSync(PIDF); } catch { /* gone */ } }
});
process.on('SIGINT', () => process.exit(0));
