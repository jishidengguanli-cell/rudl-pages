// functions/api/order.js
// 建立充值訂單（目前為模擬付款：下單即加點）
// 依據登入會員 uid（session）寫入 KV: POINTS，key = "points:<uid>"

import { readCookie, verifySession } from "../../_lib/auth";

// 與你的 plans.js 對齊：200/$15、500/$35、2000/$120、5000/$300、15000/$850
const PLAN_MAP = {
  p200:   { points: 200,   priceCents: 1500   },
  p500:   { points: 500,   priceCents: 3500   },
  p2000:  { points: 2000,  priceCents: 12000  },
  p5000:  { points: 5000,  priceCents: 30000  },
  p15000: { points: 15000, priceCents: 85000  },
};

export async function onRequestPost({ request, env }) {
  // 1) 取得會員 uid：優先用 session，其次相容舊的 cookie uid
  let uid = "";
  try {
    const sid = readCookie(request, "sid");
    if (sid) {
      const p = await verifySession(env.SESSION_SECRET, sid);
      if (p && p.uid) uid = p.uid;
    }
  } catch { /* ignore */ }

  if (!uid) {
    const cookie = request.headers.get("cookie") || "";
    const m = cookie.match(/(?:^|;\s*)uid=([^;]+)/);
    if (m) uid = decodeURIComponent(m[1]);
  }
  if (!uid) return json({ error: "UNAUTHORIZED" }, 401);

  // 2) 解析 body 取得方案
  let body = {};
  try { body = await request.json(); } catch {}
  const planId = body && body.planId;
  const plan = PLAN_MAP[planId];
  if (!plan) return json({ error: "PLAN_NOT_FOUND" }, 400);

  // 3) 加點到該會員（KV: POINTS，key=points:<uid>）
  const key = `points:${uid}`;
  const cur = parseInt((await env.POINTS.get(key)) || "0", 10);
  const next = cur + plan.points;
  await env.POINTS.put(key, String(next));

  // 可選：若你想留一筆簡單訂單紀錄，可在此寫入另一個 KV namespace（此處不強制）
  return json({ ok: true, balance: next });
}

/* ---------------- utils ---------------- */
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
