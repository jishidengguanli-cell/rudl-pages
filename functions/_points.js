// functions/_points.js
export const COST = { android: 3, ios: 5 };

export async function getBalance(env, ownerUid) {
  const key = `points:${ownerUid}`;
  const cur = parseInt(await env.POINTS.get(key) || '0', 10);
  return cur;
}

/**
 * 針對某會員扣點（platform: 'android' | 'ios'）
 * - ownerUid: 會員 UID（link 擁有者）
 * - opId: 可選；若提供，7 天內同一 opId 不重覆扣
 */
export async function deductForOwner(env, ownerUid, platform, opId) {
  const cost = platform === 'android' ? COST.android : COST.ios;

  if (opId) {
    const opKey = `points:op:${opId}`;
    const done = await env.POINTS.get(opKey);
    if (done) return { ok: true, balance: await getBalance(env, ownerUid), deduped: true };
  }

  const key = `points:${ownerUid}`;
  const cur = parseInt(await env.POINTS.get(key) || '0', 10);
  if (cur < cost) return { ok: false, status: 402, error: 'INSUFFICIENT_POINTS', balance: cur };

  const next = cur - cost;
  await env.POINTS.put(key, String(next));

  if (opId) {
    await env.POINTS.put(`points:op:${opId}`, '1', { expirationTtl: 60 * 60 * 24 * 7 });
  }
  return { ok: true, balance: next };
}
