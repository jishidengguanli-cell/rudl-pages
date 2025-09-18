// functions/_points.js
export const COST = { android: 3, ios: 5 };

export async function deductFor(env, ownerUid, platform) {
  if (!['android', 'ios'].includes(platform)) {
    return { ok: false, status: 400, error: 'INVALID_PLATFORM' };
  }
  const key = `points:${ownerUid}`;
  const cost = COST[platform];
  const cur = parseInt(await env.POINTS.get(key) || '0', 10);
  if (!Number.isFinite(cur)) return { ok: false, status: 500, error: 'BAD_POINTS' };
  if (cur < cost) return { ok: false, status: 402, error: 'INSUFFICIENT_POINTS' };

  const next = cur - cost;
  await env.POINTS.put(key, String(next));
  return { ok: true, balance: next };
}
