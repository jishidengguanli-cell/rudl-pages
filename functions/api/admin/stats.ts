// functions/api/admin/stats.ts
import { readCookie, verifySession, Env as AuthEnv } from "../_lib/auth";

export interface Env extends AuthEnv {
  USERS: KVNamespace;
  LINKS: KVNamespace;
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

  // count users
  let users = 0, cursor: string|undefined = undefined;
  do {
    const r = await ctx.env.USERS.list({ prefix:"user:", cursor });
    users += r.keys.length; cursor = r.cursor;
  } while (cursor && cursor.length);

  // count links
  let links = 0; cursor = undefined;
  do {
    const r = await ctx.env.LINKS.list({ prefix:"link:", cursor });
    links += r.keys.length; cursor = r.cursor;
  } while (cursor && cursor.length);

  return J({ ok:true, users, links, ts: Date.now() });
};
