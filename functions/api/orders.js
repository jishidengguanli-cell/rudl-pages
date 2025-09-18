// functions/api/orders.ts
import { readCookie, verifySession } from "../_lib/auth";

const PLAN_MAP: Record<string, { points: number; priceCents: number }> = {
  p200:   { points: 200,   priceCents: 1500   },
  p500:   { points: 500,   priceCents: 3500   },
  p2000:  { points: 2000,  priceCents: 12000  },
  p5000:  { points: 5000,  priceCents: 30000  },
  p15000: { points: 15000, priceCents: 85000  },
};

export const onRequestPost: PagesFunction = async ({ request, env }) => {
  // 會員 uid 以登入 session 為主
  let uid = "";
  try {
    const sid = readCookie(request, "sid");
    if (sid) {
      const p = await verifySession(env.SESSION_SECRET, sid);
      if (p?.uid) uid = p.uid;
    }
  } catch {}

  // 兼容舊的 cookie uid（非必需，可留著）
  if (!uid) {
    const cookie = request.headers.get("cookie") || "";
    const m = cookie.match(/(?:^|;\s*)uid=([^;]+)/);
    uid = m ? decodeURIComponent(m[1]) : "";
  }

  if (!uid) return json({ error: "UNAUTHORIZED" }, 401);

  const body = await request.json().catch(() => ({}));
  const plan = PLAN_MAP[body?.planId];
  if (!plan) return json({ error: "PLAN_NOT_FOUND" }, 400);

  const key = `points:${uid}`;
  const cur = parseInt((await env.POINTS.get(key)) || "0", 10);
  const next = cur + plan.points;
  await env.POINTS.put(key, String(next));

  return json({ ok: true, balance: next });
};

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
