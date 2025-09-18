// functions/api/admin/points/ledger.ts
import { readCookie, verifySession, Env as AuthEnv } from "../../_lib/auth";
import { Env as PEnv, J } from "../../_lib/points";

export interface Env extends AuthEnv, PEnv {
  POINTS: KVNamespace;
  ADMIN_EMAILS: string;
}

async function requireAdmin(ctx: PagesFunction<Env>["context"]) {
  const sid = readCookie(ctx.request, "sid");
  const me = sid ? await verifySession(ctx.env.SESSION_SECRET, sid) : null;
  if (!me) return J({ error: "unauthorized" }, 401);
  const wl = (ctx.env.ADMIN_EMAILS || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
  if (!wl.includes((me.email || "").toLowerCase())) return J({ error: "forbidden" }, 403);
  return me;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const ok = await requireAdmin(ctx);
  // @ts-ignore
  if (ok instanceof Response) return ok;

  const url = new URL(ctx.request.url);
  const uid = (url.searchParams.get("uid") || "").trim();
  const limit = Math.min(20, Number(url.searchParams.get("limit") || "5") || 5);
  let cursor = url.searchParams.get("cursor") || undefined;
  const q = (url.searchParams.get("q") || "").toLowerCase();

  if (!uid) return J({ error: "uid required" }, 400);

  const items: any[] = [];
  let next = cursor, safety = 0;

  while (items.length < limit && safety++ < 50) {
    const res = await ctx.env.POINTS.list({ prefix: `ptlog:${uid}:`, cursor: next || undefined, limit: 100 });
    for (const k of res.keys) {
      const raw = await ctx.env.POINTS.get(k.name);
      if (!raw) continue;
      try {
        const e = JSON.parse(raw);
        const text = JSON.stringify(e).toLowerCase();
        if (!q || text.includes(q)) items.push(e);
        if (items.length >= limit) break;
      } catch {}
    }
    if (items.length >= limit || res.list_complete) { next = res.cursor || undefined; break; }
    next = res.cursor || undefined;
  }

  // 依 ts DESC
  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));

  return J({ ok: true, items, cursor: next });
};
