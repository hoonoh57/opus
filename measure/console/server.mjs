// opus lab console. Local only (127.0.0.1). Not the kernel.
// Runs only scripts registered in steps.json, appends results to results/ledger.jsonl and commits that file.
import http from 'node:http';
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, statSync, mkdirSync, unlinkSync } from 'node:fs';
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
  try {
    if (git(['status', '--porcelain', '--', LEDGER_REL])) {
      git(['add', '--', LEDGER_REL]);
      git(['commit', '-q', '-m', msg, '--', LEDGER_REL]);
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

function state() {
  const st = steps();
  const blocked = {};
  for (const s of st.steps) blocked[s.id] = blockedNow(s.rule);
  return {
    steps: st, ledger: ledger().slice(-300), share, blocked,
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
    req.on('data', (c) => { raw += c; if (raw.length > 10000) req.destroy(); });
    req.on('end', () => {
      let b = {};
      try { b = raw ? JSON.parse(raw) : {}; } catch { return send(400, { err: 'bad json' }); }
      if (req.url === '/api/run') { const e = startRun(b); return send(200, e ? { err: e } : { ok: true }); }
      if (req.url === '/api/share') { shareLedger('lab: share retry'); return send(200, share); }
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
