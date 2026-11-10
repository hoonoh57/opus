// M01: token life, reissue behavior (same token? old token still valid?)
import { main, requireEnv, Rec, issue, query, rq, kstToEpoch, sleep } from './common.ts';

main('M01', async () => {
  const env = requireEnv(['mock', 'real']);
  const rec = new Rec('M01', env);
  try {
    const a = await issue(env, rec);
    const exp = kstToEpoch(a.expires_dt);
    const lifeMin = exp ? Math.round((exp - a.issuedWall) / 60000) : null;

    const qa1 = await query(env, a.token, 'quote');
    rq(rec, 'A-before', qa1);
    if (qa1.rc !== 0) throw new Error('baseline query with A failed http ' + qa1.http + ' rc ' + qa1.rc + ' ' + qa1.msg.slice(0, 80));

    await sleep(3000);
    const b = await issue(env, rec);
    const same = a.token === b.token;
    rec.w('compare', { sameToken: same, expiresA: a.expires_dt, expiresB: b.expires_dt });

    await sleep(2000);
    const qa2 = await query(env, a.token, 'quote');
    rq(rec, 'A-after-reissue', qa2);
    const qb = await query(env, b.token, 'quote');
    rq(rec, 'B', qb);

    const oldTok = qa2.rc === 0 ? 'valid' : 'invalid(rc=' + qa2.rc + ')';
    const newTok = qb.rc === 0 ? 'ok' : 'rc=' + qb.rc;
    return 'M01 OK env=' + env + ' life_min=' + (lifeMin ?? 'unknown') + ' expires_dt=' + (a.expires_dt || '-') +
      ' reissue_same_token=' + (same ? 'yes' : 'no') + ' old_token_after_reissue=' + oldTok + ' new_token=' + newTok + ' n=1';
  } finally {
    rec.close();
  }
});
