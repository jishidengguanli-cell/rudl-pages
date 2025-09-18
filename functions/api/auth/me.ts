/// <reference types="@cloudflare/workers-types" />
import { readCookie, verifySession } from "../_lib/auth";
import type { Env } from "../_lib/auth"; // 🔧 用 type 匯入

// 如果你的 ../_lib/auth 沒有匯出 Env 型別，就用下面這段取代上一行：
// export interface Env { SESSION_SECRET: string; POINTS: KVNamespace }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const sid = readCookie(ctx.request, "sid");
  if (!sid) return json({ authenticated: false });

  const p = await verifySession(ctx.env.SESSION_SECRET, sid);
  if (!p) return json({ authenticated: false });

  return json({ authenticated: true, uid: p.uid, email: p.email });
};

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
