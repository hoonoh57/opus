// M04: REST rate limit by stairs. Mock only, after hours, query TR only (MT3).
import { main, requireEnv, requireAfterHours, arg, Rec, issue, query, rq, sleep, pct, TR, Resp, TrName } from './common.ts';

main('M04', async () => {
  const env = requireEnv(['mock']);
  requireAfterHours();
  const tr = (arg('tr') ?? 'quote') as TrName;
  if (!(tr in TR)) throw new Error('--tr quote|chart');
  const stepSec = Math.max(10, Number(arg('step') ?? 30));
  const maxRate = Math.min(Math.max(1, Number(arg('max') ?? 10)), 20);
  const MAX_INFLIGHT = 5;

  const rec = new Rec('M04', env);
  try {
    const t = await issue(env, rec);
    const q0 = await query(env, t.token, tr);
    rq(rec, 'baseline', q0);
    if (q0.rc !== 0) throw new Error('baseline query failed http ' + q0.http + ' rc ' + q0.rc + ' ' + q0.msg.slice(0, 80));

    const st: { r: Resp | null; rate: number } = { r: null, rate: 0 };
    let sent = 0, ok = 0, skipped = 0, inflight = 0;
    const lat: number[] = [];

    for (let rate = 1; rate <= maxRate && !st.r; rate++) {
      rec.w('step', { rate });
      const gap = 1000 / rate;
      const end = performance.now() + stepSec * 1000;
      let next = performance.now();
      while (performance.now() < end && !st.r) {
        const now = performance.now();
        if (now < next) { await sleep(next - now); continue; }
        next += gap;
        if (inflight >= MAX_INFLIGHT) { skipped++; rec.w('skip', { rate, inflight }); continue; }
        inflight++; sent++;
        void query(env, t.token, tr).then((r) => {
          inflight--;
          rec.w('resp', { rate, http: r.http, rc: r.rc, ms: r.ms, msg: r.rc === 0 ? undefined : r.msg });
          if (r.http === 200 && r.rc === 0) { ok++; lat.push(r.ms); }
          else if (!st.r) { st.r = r; st.rate = rate; }
        });
      }
    }

    const t0 = performance.now();
    while (inflight > 0 && performance.now() - t0 < 15000) await sleep(100);
    const stats = ' sent=' + sent + ' ok=' + ok + ' skipped=' + skipped + ' p50_ms=' + pct(lat, 0.5) + ' max_ms=' + pct(lat, 1);

    if (!st.r) return 'M04 OK env=mock tr=' + tr + ' no_reject_up_to=' + maxRate + '/s step_s=' + stepSec + stats;

    let recoverS = -1;
    let tokenKept = 'unknown';
    for (let i = 1; i <= 12; i++) {
      await sleep(10000);
      const p = await query(env, t.token, tr);
      rq(rec, 'probe-' + i, p);
      if (p.http === 200 && p.rc === 0) { recoverS = i * 10; tokenKept = 'yes'; break; }
      if (p.rc === 8005) { tokenKept = 'no'; break; }
    }
    const r = st.r;
    return 'M04 OK env=mock tr=' + tr + ' first_reject_rate=' + st.rate + '/s http=' + r.http + ' rc=' + r.rc +
      ' msg=' + r.msg.slice(0, 50) + ' recover_s=' + recoverS + ' token_kept=' + tokenKept + ' step_s=' + stepSec + stats;
  } finally {
    rec.close();
  }
});
