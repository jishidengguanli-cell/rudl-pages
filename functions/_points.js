// functions/api/me/points.ts
import { readCookie, verifySession } from "../_lib/auth";

export const onRequestGet: PagesFunction = async ({ request, env }) => {
  // 先用登入 session 取得會員 uid
  let uid = "";
  try {
    const sid = readCookie(request, "sid");
    if (sid) {
      const p = await verifySession(env.SESSION_SECRET, sid);
      if (p?.uid) uid = p.uid;
    }
  } catch {}

  // 兼容：若沒登入，退回舊的 cookie uid（避免你還在測試）
  if (!uid) {
    const cookie = request.headers.get("cookie") || "";
    const m = cookie.match(/(?:^|;\s*)uid=([^;]+)/);
    uid = m ? decodeURIComponent(m[1]) : "";
  }

  if (!uid) return json({ points: 0 });

  const key = `points:${uid}`;
  const cur = await env.POINTS.get(key);
  return json({ points: parseInt(cur || "0", 10) });
};

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
