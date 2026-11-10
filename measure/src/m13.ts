// M13: revoke then reissue (new token? expiry extended? revoke propagation delay)
import { main, requireEnv, Rec, issue, revoke, query, rq, sleep } from './common.ts';

main('M13', async () => {
  const env = requireEnv(['mock', 'real']);
  const rec = new Rec('M13', env);
  try {
    const a = await issue(env, rec);
    const q0 = await query(env, a.token, 'quote'); rq(rec, 'A-before', q0);
    if (q0.rc !== 0) throw new Error('baseline rc ' + q0.rc + ' ' + q0.msg.slice(0, 60));
    await sleep(1500);
    const rv = await revoke(env, rec, a.token);
    if (rv.rc !== 0) throw new Error('revoke rc ' + rv.rc + ' ' + rv.msg.slice(0, 60));
    await sleep(2000);
    const q1 = await query(env, a.token, 'quote'); rq(rec, 'A-after-revoke', q1);
    await sleep(1500);
    const b = await issue(env, rec);
    const same = a.token === b.token;
    rec.w('compare', { sameToken: same, expiresA: a.expires_dt, expiresB: b.expires_dt });
    await sleep(1500);
    const q2 = await query(env, b.token, 'quote'); rq(rec, 'B', q2);
    await sleep(60000);
    const q3 = await query(env, a.token, 'quote'); rq(rec, 'A-after-60s', q3);
    const f = (r: any) => (r.rc === 0 ? 'ok' : 'rc=' + r.rc);
    return 'M13 OK env=' + env + ' A_after_revoke=' + f(q1) + ' reissue_same_token=' + (same ? 'yes' : 'no') +
      ' expA=' + a.expires_dt + ' expB=' + b.expires_dt + ' B=' + f(q2) + ' A_after_60s=' + f(q3) + ' n=1';
  } finally {
    rec.close();
  }
});
