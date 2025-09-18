// functions/api/me/points.js
import { readCookie, verifySession } from "../_lib/auth";

export async function onRequestGet({ request, env }) {
  let uid = "";
  try {
    const sid = readCookie(request, "sid");
    if (sid) {
      const p = await verifySession(env.SESSION_SECRET, sid);
      if (p && p.uid) uid = p.uid;
    }
  } catch {}

  // 兼容：沒登入時仍回 cookie uid 的點數（避免你測試白頁）
  if (!uid) {
    const cookie = request.headers.get("cookie") || "";
    const m = cookie.match(/(?:^|;\s*)uid=([^;]+)/);
    if (m) uid = decodeURIComponent(m[1]);
  }

  const key = uid ? `points:${uid}` : "";
  const cur = key ? await env.POINTS.get(key) : null;
  const points = parseInt(cur || "0", 10);

  return new Response(JSON.stringify({ points }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
