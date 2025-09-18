// functions/api/admin/points/adjust.ts
import { readCookie, verifySession, Env as AuthEnv } from "../../_lib/auth";
import { Env as PEnv, adminAdjust, J } from "../../_lib/points";

export interface Env extends AuthEnv, PEnv {
  POINTS: KVNamespace;
  USERS: KVNamespace;
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

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const me = await requireAdmin(ctx);
  // @ts-ignore
  if (me instanceof Response) return me;

  const body = await ctx.request.json().catch(() => ({}));
  const uid = (body.uid || "").trim();
  const delta = Number(body.delta || 0);
  const note = (body.note || "").slice(0, 200);

  if (!uid) return J({ error: "uid required" }, 400);
  if (!Number.isFinite(delta) || Math.floor(delta) !== delta) return J({ error: "delta must be integer" }, 400);

  const { balance } = await adminAdjust(ctx.env as any, uid, delta, (me.email || ""), note);
  return J({ ok: true, balance });
};
