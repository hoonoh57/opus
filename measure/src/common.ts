// opus measure common (docs/05 MT1-MT8). Not the kernel.
import { readFileSync, mkdirSync, openSync, writeSync, closeSync, unlinkSync, fsyncSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Env = 'mock' | 'real';
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const REST: Record<Env, string> = { mock: 'https://mockapi.kiwoom.com', real: 'https://api.kiwoom.com' };

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function requireEnv(allowed: Env[]): Env {
  const e = arg('env');
  if (e !== 'mock' && e !== 'real') throw new Error('--env mock|real required (MT6)');
  if (!allowed.includes(e)) throw new Error('env ' + e + ' not allowed for this experiment');
  if (e === 'real' && arg('confirm') !== 'REAL') throw new Error('real env needs --confirm REAL (MT6). Stop other apps using the same key first (MT5)');
  return e;
}

function loadDotEnv(): Record<string, string> {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) throw new Error('measure/.env missing (copy env.example.txt)');
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

export function keys(env: Env) {
  const d = loadDotEnv();
  const p = env === 'mock' ? 'KIWOOM_MOCK_' : 'KIWOOM_REAL_';
  const appkey = d[p + 'APP_KEY'] ?? '';
  const secretkey = d[p + 'SECRET_KEY'] ?? '';
  if (!appkey || !secretkey) throw new Error(p + 'APP_KEY / ' + p + 'SECRET_KEY empty in measure/.env');
  return { appkey, secretkey };
}

// single instance (MT5)
export function acquireLock(): void {
  const dir = join(ROOT, 'lab-data');
  mkdirSync(dir, { recursive: true });
  const lockPath = join(dir, 'measure.lock');
  try {
    const fd = openSync(lockPath, 'wx');
    writeSync(fd, String(process.pid));
    closeSync(fd);
  } catch {
    let pid = 0;
    try { pid = Number(readFileSync(lockPath, 'utf8')); } catch { /* none */ }
    let alive = false;
    try { if (pid) { process.kill(pid, 0); alive = true; } } catch { /* dead */ }
    if (alive) throw new Error('another measure process is running, pid ' + pid);
    unlinkSync(lockPath);
    return acquireLock();
  }
  const release = () => { try { unlinkSync(lockPath); } catch { /* gone */ } };
  process.on('exit', release);
  process.on('SIGINT', () => { release(); process.exit(130); });
}

// redaction at write time (06 2-4, MT7)
const SECRET_KEYS = /^(token|access_token|appkey|secretkey|authorization)$/i;
export function redact(v: any): any {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object') {
    const o: any = {};
    for (const [k, x] of Object.entries(v)) {
      if (SECRET_KEYS.test(k)) o[k] = x ? '<redacted>' : x;
      else if (/acnt|acct/i.test(k) && typeof x === 'string') o[k] = x.length > 4 ? '*' + x.slice(-4) : x;
      else o[k] = redact(x);
    }
    return o;
  }
  return v;
}

// record file in 06 style (MT1)
export class Rec {
  private fd: number;
  private seq = 0;
  constructor(exp: string, env: string) {
    const now = new Date();
    const dir = join(ROOT, 'lab-data', 'measure', now.toISOString().slice(0, 10));
    mkdirSync(dir, { recursive: true });
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    this.fd = openSync(join(dir, exp + '-' + env + '-' + stamp + '.jsonl'), 'a');
    this.w('head', { exp, env, node: process.version, pid: process.pid });
  }
  w(kind: string, body: unknown): void {
    const line = JSON.stringify({ seq: ++this.seq, mono: Math.round(performance.now()), wall: new Date().toISOString(), kind, body: redact(body) });
    writeSync(this.fd, line + '\n');
  }
  close(): void {
    try { fsyncSync(this.fd); closeSync(this.fd); } catch { /* ignore */ }
  }
}

export interface Resp { http: number; rc: number | null; msg: string; ms: number; body: any }

export async function post(env: Env, path: string, headers: Record<string, string>, body: unknown, timeoutMs = 10000): Promise<Resp> {
  const t0 = performance.now();
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(REST[env] + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json;charset=UTF-8', ...headers },
      body: JSON.stringify(body ?? {}),
      signal: ac.signal,
    });
    const text = await r.text();
    let j: any = {};
    try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text.slice(0, 200) }; }
    const rc = j.return_code === undefined || j.return_code === null ? null : Number(j.return_code);
    return { http: r.status, rc, msg: String(j.return_msg ?? ''), ms: Math.round(performance.now() - t0), body: j };
  } catch (e: any) {
    const why = e?.name === 'AbortError' ? 'timeout' : String(e?.message ?? e);
    return { http: 0, rc: null, msg: 'NETWORK ' + why.slice(0, 120), ms: Math.round(performance.now() - t0), body: null };
  } finally {
    clearTimeout(tm);
  }
}

export interface Tok { token: string; expires_dt: string; issuedWall: number }

export async function issue(env: Env, rec: Rec): Promise<Tok> {
  const k = keys(env);
  const r = await post(env, '/oauth2/token', {}, { grant_type: 'client_credentials', appkey: k.appkey, secretkey: k.secretkey });
  rec.w('issue', { http: r.http, rc: r.rc, msg: r.msg, ms: r.ms, expires_dt: r.body?.expires_dt, token_type: r.body?.token_type, gotToken: !!r.body?.token });
  if (!r.body?.token) throw new Error('issue failed http ' + r.http + ' rc ' + r.rc + ' ' + r.msg.slice(0, 80));
  return { token: String(r.body.token), expires_dt: String(r.body.expires_dt ?? ''), issuedWall: Date.now() };
}

export async function revoke(env: Env, rec: Rec, token: string): Promise<Resp> {
  const k = keys(env);
  const r = await post(env, '/oauth2/revoke', {}, { appkey: k.appkey, secretkey: k.secretkey, token });
  rec.w('revoke', { http: r.http, rc: r.rc, msg: r.msg, ms: r.ms });
  return r;
}

function ymd(): string {
  const d = new Date(Date.now() + 9 * 3600000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export const TR = {
  quote: { apiId: 'ka10001', path: '/api/dostk/stkinfo', body: () => ({ stk_cd: '005930' }) },
  chart: { apiId: 'ka10081', path: '/api/dostk/chart', body: () => ({ stk_cd: '005930', base_dt: ymd(), upd_stkpc_tp: '1' }) },
};
export type TrName = keyof typeof TR;

export function query(env: Env, token: string, tr: TrName, timeoutMs = 10000): Promise<Resp> {
  const t = TR[tr];
  return post(env, t.path, { authorization: 'Bearer ' + token, 'api-id': t.apiId }, t.body(), timeoutMs);
}

export function rq(rec: Rec, tag: string, r: Resp): void {
  rec.w('query', { tag, http: r.http, rc: r.rc, ms: r.ms, msg: r.msg });
}

// expires_dt 'YYYYMMDDHHmmss' in KST
export function kstToEpoch(s: string): number | null {
  if (!/^\d{14}$/.test(s)) return null;
  const n = (a: number, b: number) => Number(s.slice(a, b));
  return Date.UTC(n(0, 4), n(4, 6) - 1, n(6, 8), n(8, 10), n(10, 12), n(12, 14)) - 9 * 3600000;
}

export function requireAfterHours(): void {
  const d = new Date(Date.now() + 9 * 3600000);
  const dow = d.getUTCDay();
  const hm = d.getUTCHours() * 100 + d.getUTCMinutes();
  if (dow >= 1 && dow <= 5 && hm >= 800 && hm < 1540) throw new Error('not allowed 08:00-15:40 KST on weekdays (MT3)');
}

export function pct(a: number[], p: number): number {
  if (!a.length) return -1;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

// one ASCII line (MT8, E02)
export function ascii(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}

export async function main(exp: string, fn: () => Promise<string>): Promise<void> {
  try {
    acquireLock();
    const line = await fn();
    console.log(ascii(line));
    process.exitCode = 0;
  } catch (e: any) {
    console.log(ascii(exp + ' FAIL ' + String(e?.message ?? e).slice(0, 200)));
    process.exitCode = 1;
  }
}
