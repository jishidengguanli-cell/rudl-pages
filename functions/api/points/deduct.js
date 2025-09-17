// functions/api/points/deduct.js
import { getUid } from '../../../_utils.js';

const COST = { android: 3, ios: 5 };

export async function onRequestPost({ request, env }) {
  const uid = getUid(request);
  const { platform } = await request.json();
  if (platform !== 'android' && platform !== 'ios') {
    return new Response(JSON.stringify({ error: 'INVALID_PLATFORM' }), { status: 400 });
  }

  const key = `points:${uid}`;
  const cur = parseInt(await env.POINTS.get(key) || '0', 10);
  const cost = platform === 'android' ? COST.android : COST.ios;

  if (cur < cost) {
    return new Response(JSON.stringify({ error: 'INSUFFICIENT_POINTS' }), { status: 402 });
  }

  const next = cur - cost;
  await env.POINTS.put(key, String(next));
  return Response.json({ ok: true, balance: next });
}
