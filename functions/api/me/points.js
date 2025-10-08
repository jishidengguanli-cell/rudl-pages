// functions/api/me/points.js
import { getUid } from "../../_utils.js";

export async function onRequestGet({ request, env }) {
  // 先透過共用工具取得 uid（相容你在 points/deduct.js 的做法）
  const uid = await getUid(request, env);

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
