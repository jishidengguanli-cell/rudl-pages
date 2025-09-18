// functions/api/admin/points/adjust.ts
import { readCookie, verifySession } from "../../_lib/auth";
import { J, adminAdjust, Env as PEnv } from "../../_lib/points";

interface Env extends PEnv {
  POINTS: KVNamespace;
  USERS: KVNamespace;
  ADMIN_EMAILS: string;
}

async function adminEmail(env: Env, request: Request) {
  const sid = readCookie(request, "sid");
  const me = sid ? await verifySession(env.SESSION_SECRET, sid) : null;
  const wl = (env.ADMIN_EMAILS || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
  if (!me || !wl.includes((me.email || "").toLowerCase())) return null;
  return me.email || "";
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const who = await adminEmail(env, request);
  if (!who) return J({ error: "unauthorized" }, 401);

  const body = await request.json().catch(() => ({}));
  const uid = (body.uid || "").trim();
  const delta = Number(body.delta || 0);
  const note = (body.note || "").slice(0, 200);

  if (!uid) return J({ error: "uid required" }, 400);
  if (!Number.isFinite(delta) || Math.floor(delta) !== delta) {
    return J({ error: "delta must be integer" }, 400);
  }

  const { balance } = await adminAdjust(env as any, uid, delta, who, note);
  return J({ ok: true, balance });
};
