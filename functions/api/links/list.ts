// functions/api/links/list.ts
import { readCookie, verifySession, Env as AuthEnv } from "../_lib/auth";

export interface Env extends AuthEnv {
  LINKS: KVNamespace;
}

function j(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const sid = readCookie(ctx.request, "sid");
    const me = sid ? await verifySession(ctx.env.SESSION_SECRET, sid) : null;
    if (!me) return j({ error: "unauthorized" }, 401);

    const listKey = `user:${me.uid}:codes`;
    const raw = (await ctx.env.LINKS.get(listKey)) || "";
    const codes = raw.split("\n").filter(Boolean);

    const items: any[] = [];
    for (const code of codes) {
      const v = await ctx.env.LINKS.get(`link:${code}`);
      if (!v) continue;
      try {
        const rec = JSON.parse(v);
        items.push(rec);
      } catch {
        // ignore broken record
      }
    }
    items.sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));
    return j({ items });
  } catch (e: any) {
    return j({ error: "internal", detail: String(e?.message || e) }, 500);
  }
};
