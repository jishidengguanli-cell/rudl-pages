// functions/api/admin/users/get.ts
import { readCookie, verifySession } from "../../_lib/auth";
import { J, readLinkCounters, getBalance, Env as PEnv } from "../../_lib/points";

interface Env extends PEnv {
  USERS: KVNamespace;
  LINKS: KVNamespace;
  POINTS: KVNamespace;
  ADMIN_EMAILS: string;
}

async function isAdmin(env: Env, request: Request) {
  const sid = readCookie(request, "sid");
  const me = sid ? await verifySession(env.SESSION_SECRET, sid) : null;
  if (!me) return null;
  const wl = (env.ADMIN_EMAILS || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
  return wl.includes((me.email || "").toLowerCase()) ? me : null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const me = await isAdmin(env, request);
  if (!me) return J({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const uid = (url.searchParams.get("uid") || "").trim();
  if (!uid) return J({ error: "uid required" }, 400);

  const raw = await env.USERS.get(`user:${uid}`);
  if (!raw) return J({ error: "not found" }, 404);

  let u: any = {};
  try { u = JSON.parse(raw); } catch {}
  const profile = {
    uid,
    email: u.email || "",
    role: u.role || "user",
    createdAt: u.createdAt || u.created_at || 0,
  };
  const balance = await getBalance(env as any, uid);

  // 掃描 link:<code>，過濾 owner==uid
  const links: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const res = await env.LINKS.list({ prefix: "link:", cursor, limit: 100 });
    for (const k of res.keys) {
      const code = k.name.slice(5);
      const recRaw = await env.LINKS.get(k.name);
      if (!recRaw) continue;
      try {
        const rec = JSON.parse(recRaw);
        if ((rec.owner || rec.uid || "") === uid) {
          const c = await readLinkCounters(env as any, code);
          links.push({
            code,
            platform: rec.platform || rec.type || "",
            filename: rec.filename || rec.name || "",
            createdAt: rec.createdAt || rec.created_at || 0,
            ...c,
          });
        }
      } catch {}
    }
    cursor = res.cursor || undefined;
  } while (cursor);

  return J({ ok: true, profile, balance, links });
};
