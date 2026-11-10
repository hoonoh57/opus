// M03: response form of a query made with a revoked token (8005 mapping)
import { main, requireEnv, Rec, issue, revoke, query, rq, sleep } from './common.ts';

main('M03', async () => {
  const env = requireEnv(['mock']);
  const rec = new Rec('M03', env);
  try {
    const t = await issue(env, rec);
    const q0 = await query(env, t.token, 'quote');
    rq(rec, 'before-revoke', q0);
    if (q0.rc !== 0) throw new Error('baseline query failed http ' + q0.http + ' rc ' + q0.rc + ' ' + q0.msg.slice(0, 80));

    const rv = await revoke(env, rec, t.token);
    if (rv.rc !== 0) throw new Error('revoke failed http ' + rv.http + ' rc ' + rv.rc + ' ' + rv.msg.slice(0, 80));

    await sleep(2000);
    const q1 = await query(env, t.token, 'quote');
    rq(rec, 'after-revoke', q1);
    return 'M03 OK env=mock after_revoke http=' + q1.http + ' rc=' + q1.rc + ' msg=' + q1.msg.slice(0, 60);
  } finally {
    rec.close();
  }
});
