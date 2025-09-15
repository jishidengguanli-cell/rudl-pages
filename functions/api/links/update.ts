// functions/api/links/update.ts
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

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const sid = readCookie(ctx.request, "sid");
    const me  = sid ? await verifySession(ctx.env.SESSION_SECRET, sid) : null;
    if (!me) return j({ error: "unauthorized" }, 401);

    const body = await ctx.request.json<any>().catch(() => ({}));
    const code       = String(body.code || "").trim();
    const title      = body.title      != null ? String(body.title).slice(0, 100) : undefined;
    const version    = body.version    != null ? String(body.version).slice(0, 50) : undefined;
    const bundle_id  = body.bundle_id  != null ? String(body.bundle_id).slice(0, 200) : undefined;

    if (!code) return j({ error: "code required" }, 400);

    const key = `link:${code}`;
    const raw = await ctx.env.LINKS.get(key);
    if (!raw) return j({ error: "not_found" }, 404);

    const rec = JSON.parse(raw);
    if (rec.owner !== me.uid) return j({ error: "forbidden" }, 403);

    if (title      !== undefined) rec.title      = title;
    if (version    !== undefined) rec.version    = version;     // 只影響顯示，不影響 iOS 安裝
    if (bundle_id  !== undefined) rec.bundle_id  = bundle_id;   // 只影響顯示，不影響 iOS 安裝
    rec.updatedAt = Date.now();

    await ctx.env.LINKS.put(key, JSON.stringify(rec));
    return j({ ok: true, item: rec });
  } catch (e: any) {
    return j({ error: "internal", detail: String(e?.message || e) }, 500);
  }
};
