// functions/api/links/list.ts
import { verifySession, type Env as AuthEnv } from "../../_lib/auth";

type KV = KVNamespace;

interface Env extends AuthEnv {
  LINKS: KV;   // rudl-links
}

function json(status: number, data: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  // 1) 驗證登入
  const sess = await verifySession(env, request);
  if (!sess?.userId) return json(401, { error: "unauthorized" });
  const userId = String(sess.userId);

  // 2) 全域以 link: 為前綴列出，再過濾 owner
  const { keys } = await env.LINKS.list({ prefix: "link:" });
  const items: any[] = [];

  // 依序取值（資料量通常不大；之後要最佳化再做 batch）
  for (const k of keys) {
    const s = await env.LINKS.get(k.name, "text");
    if (!s) continue;
    try {
      const obj = JSON.parse(s);
      if (obj?.owner !== userId) continue;

      // 防呆：保證 lang 存在（預設 en）
      if (!obj.lang) obj.lang = "en";

      items.push(obj);
    } catch {
      // skip 壞資料
    }
  }

  // 3) 建立時間新到舊
  items.sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));

  return json(200, { items });
};
