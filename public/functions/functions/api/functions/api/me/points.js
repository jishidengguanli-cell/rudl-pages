// functions/api/me/points.js
import { getUid } from '../../_utils.js';

export async function onRequestGet({ request, env }) {
  const uid = getUid(request);
  const key = `points:${uid}`;
  const cur = await env.POINTS.get(key);
  return Response.json({ points: parseInt(cur || '0', 10) });
}
