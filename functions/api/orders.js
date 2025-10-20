// functions/api/orders.js
// 模擬付款：建立訂單即加點到「登入會員」的帳戶 (points:<uid>)
import { readCookie, verifySession } from "./_lib/auth";

const PLAN_MAP = {
  p200:   { points: 200,   priceCents: 100   },
  p1000:   { points: 1000,   priceCents: 500   },
  p5000:  { points: 5000,  priceCents: 1500  },
  p15000:  { points: 15000,  priceCents: 3500  },
  p50000: { points: 50000, priceCents: 10000  },
  p100000: { points: 100000, priceCents: 20000  },
};

const PURCHASES_ENABLED = false;

export async function onRequestPost({ request, env }) {
  if (!PURCHASES_ENABLED) {
    return json(
      { error: "PURCHASE_DISABLED", message: "Purchasing is currently disabled." },
      503,
    );
  }

  // 以 session 取得會員 uid；若沒登入，再相容舊 cookie uid（避免你測試時白頁）
  let uid = "";
  try {
    const sid = readCookie(request, "sid");
    if (sid) {
      const p = await verifySession(env.SESSION_SECRET, sid);
      if (p && p.uid) uid = p.uid;
    }
  } catch {}

  if (!uid) {
    const cookie = request.headers.get("cookie") || "";
    const m = cookie.match(/(?:^|;\s*)uid=([^;]+)/);
    if (m) uid = decodeURIComponent(m[1]);
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
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
