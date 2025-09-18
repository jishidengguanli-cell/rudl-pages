// functions/_points.ts
export const COST = { android: 3, ios: 5 } as const;

export async function getBalance(env: { POINTS: KVNamespace }, ownerUid: string) {
  const key = `points:${ownerUid}`;
  const cur = parseInt((await env.POINTS.get(key)) || '0', 10);
  return cur;
}

/**
 * 針對某「會員」扣點（平台 android / ios）
 * - ownerUid: 會員 UID（分發連結的擁有者）
 * - platform: 'android' | 'ios'
 * - opId: 去重 key（可選）；傳入一個可重試時不重複扣款的 id
 */
export async function deductForOwner(
  env: { POINTS: KVNamespace },
  ownerUid: string,
  platform: 'android' | 'ios',
  opId?: string
) {
  const cost = platform === 'android' ? COST.android : COST.ios;

  // 去重（可選）：同 opId 7 天內只扣一次
  if (opId) {
    const done = await env.POINTS.get(`points:op:${opId}`);
    if (done) return { ok: true, balance: await getBalance(env, ownerUid), deduped: true };
  }

  const key = `points:${ownerUid}`;
  const cur = parseInt((await env.POINTS.get(key)) || '0', 10);
  if (cur < cost) return { ok: false, status: 402 as const, error: 'INSUFFICIENT_POINTS', balance: cur };

  const next = cur - cost;
  await env.POINTS.put(key, String(next));

  if (opId) {
    await env.POINTS.put(`points:op:${opId}`, '1', { expirationTtl: 60 * 60 * 24 * 7 });
  }
  return { ok: true, balance: next };
}
