// functions/api/orders.js
import { getUid } from '../../_utils.js';

const PLAN_MAP = {
  p100:   { points: 100,   priceCents: 1000   },
  p500:   { points: 500,   priceCents: 4500   },
  p2000:  { points: 2000,  priceCents: 15000  },
  p5000:  { points: 5000,  priceCents: 40000  },
  p15000: { points: 15000, priceCents: 110000 },
};

export async function onRequestPost({ request, env }) {
  const uid = getUid(request);
  const { planId } = await request.json();
  const plan = PLAN_MAP[planId];
  if (!plan) return new Response(JSON.stringify({ error: 'PLAN_NOT_FOUND' }), { status: 400 });

  const key = `points:${uid}`;
  const cur = parseInt(await env.POINTS.get(key) || '0', 10);
  const next = cur + plan.points;
  await env.POINTS.put(key, String(next));
  return Response.json({ ok: true, balance: next });
}
