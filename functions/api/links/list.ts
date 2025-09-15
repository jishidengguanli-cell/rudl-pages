import { readCookie, verifySession, Env as AuthEnv } from "../_lib/auth";

export interface Env extends AuthEnv {
  LINKS: KVNamespace;
}

// 列出目前登入使用者的所有分發（簡要資訊）
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const { LINKS, SESSION_SECRET } = ctx.env;
    const sid = readCookie(ctx.request, "sid");
    const me = sid ? await verifySession(SESSION_SECRET, sid) : null;
    if (!me) return j({ error: "unauthorized" }, 401);

    const listKey = `user:${me.uid}:codes`;
    const raw = (await LINKS.get(listKey)) || "";
    const codes = raw.split("\n").filter(Boolean);

    const items = [];
    for (const code of codes) {
      const rec = await LINKS.get(`link:${code}`);
      if (rec) items.push(JSON.parse(rec));
    }
    return j({ items });
  } catch (e: any) {
    return j({ error: "internal", detail: String(e?.message || e) }, 500);
  }
};

function j(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
