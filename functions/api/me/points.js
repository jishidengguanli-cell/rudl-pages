// functions/api/me/points.js
import { getUid } from "../../_utils.js";

export async function onRequestGet({ request, env }) {
  // 先透過共用工具取得 uid（相容你在 points/deduct.js 的做法）
  let uid = "";
  try {
    uid = getUid(request) || "";
  } catch {
    uid = "";
  }

  // 兼容：若尚未登入，但以 cookie 的 uid 做測試，仍回傳該 uid 的點數
  if (!uid) {
    try {
      const cookie = request.headers.get("cookie") || "";
      const m = cookie.match(/(?:^|;\s*)uid=([^;]+)/);
      if (m) uid = decodeURIComponent(m[1]);
    } catch {
      uid = "";
    }
  }

  let points = 0;
  try {
    const key = uid ? `points:${uid}` : "";
    const cur = key ? await env.POINTS.get(key) : null;
    points = Number.parseInt(cur || "0", 10) || 0;
  } catch {
    points = 0;
  }

  return new Response(JSON.stringify({ points }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
