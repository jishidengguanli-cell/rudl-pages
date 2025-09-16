// functions/api/admin/users/list.ts
import { readCookie, verifySession, Env as AuthEnv } from "../../_lib/auth";

export interface Env extends AuthEnv {
  USERS: KVNamespace;
  ADMIN_EMAILS: string;
}

const J = (obj:any, status=200) =>
  new Response(JSON.stringify(obj), { status, headers:{ "content-type":"application/json; charset=utf-8", "cache-control":"no-store" } });

async function requireAdmin(ctx: PagesFunction<Env>["context"]) {
  const sid = readCookie(ctx.request, "sid");
  const me  = sid ? await verifySession(ctx.env.SESSION_SECRET, sid) : null;
  if (!me) return J({error:"unauthorized"}, 401);
  const emails = (ctx.env.ADMIN_EMAILS||"").toLowerCase().split(/[,;\s]+/).filter(Boolean);
  let isAdmin = emails.includes((me.email||"").toLowerCase());
  if (!isAdmin) {
    const urec = await ctx.env.USERS.get(`user:${me.email}`);
    if (urec) try { const u = JSON.parse(urec); if (u.role==="admin" || u.is_admin) isAdmin = true; } catch {}
  }
  if (!isAdmin) return J({error:"forbidden"}, 403);
  return me;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const meOrResp:any = await requireAdmin(ctx);
  if (meOrResp instanceof Response) return meOrResp;

  const url = new URL(ctx.request.url);
  const cursor = url.searchParams.get("cursor") || undefined;
  const limit  = Math.min(100, Number(url.searchParams.get("limit")||"50")||50);

  const res = await ctx.env.USERS.list({ prefix:"user:", cursor, limit });
  const items = await Promise.all(res.keys.map(async k => {
    const email = k.name.slice(5);
    let createdAt = 0, role = "user", uid = "";
    const v = await ctx.env.USERS.get(k.name);
    if (v) { try { const u = JSON.parse(v); createdAt = u.createdAt||0; uid = u.uid||""; if (u.role==="admin"||u.is_admin) role="admin"; } catch {} }
    return { email, uid, createdAt, role };
  }));

  return J({ ok:true, items, cursor: res.cursor, list_complete: res.list_complete });
};
