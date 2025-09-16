// functions/api/links/delete.ts
import { readCookie, verifySession, Env as AuthEnv } from "../_lib/auth";

export interface Env extends AuthEnv {
  LINKS: KVNamespace;
}

function j(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const sid = readCookie(ctx.request, "sid");
    const me  = sid ? await verifySession(ctx.env.SESSION_SECRET, sid) : null;
    if (!me) return j({ error: "unauthorized" }, 401);

    const body = await ctx.request.json<any>().catch(() => ({}));
    const code = String(body.code || "").trim();
    if (!code) return j({ error: "code required" }, 400);

    const LINKS = ctx.env.LINKS;

    // 1) 取記錄並驗證擁有者
    const key = `link:${code}`;
    const raw = await LINKS.get(key);
    if (!raw) return j({ error: "not_found" }, 404);
    const rec = JSON.parse(raw);
    
    const emails = (ctx.env.ADMIN_EMAILS||"").toLowerCase().split(/[,;\s]+/).filter(Boolean);
    const isAdmin = emails.includes((me.email||"").toLowerCase());
    if (rec.owner !== me.uid && !isAdmin) return j({ error: "forbidden" }, 403);
    
    // 2) 從使用者清單移除
    const listKey = `user:${me.uid}:codes`;
    const existing = (await LINKS.get(listKey)) || "";
    const lines = existing.split("\n").filter(Boolean).filter(c => c !== code);
    await LINKS.put(listKey, lines.join("\n"));

    // 3) 刪主記錄
    await LINKS.delete(key);

    // 4) 刪除統計（所有以 cnt:<code>: 開頭的鍵）
    await deleteCounters(LINKS, code);

    return j({ ok: true });
  } catch (e: any) {
    return j({ error: "internal", detail: String(e?.message || e) }, 500);
  }
};

async function deleteCounters(KV: KVNamespace, code: string) {
  // Workers KV 支援 list({prefix})
  const prefix = `cnt:${code}:`;
  let cursor: string | undefined = undefined;
  do {
    const res = await KV.list({ prefix, cursor });
    const dels = res.keys.map(k => KV.delete(k.name));
    await Promise.all(dels);
    cursor = res.cursor;
  } while (cursor);
}
