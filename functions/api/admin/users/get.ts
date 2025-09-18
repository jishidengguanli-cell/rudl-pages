// functions/api/admin/users/get.ts
import { readCookie, verifySession, Env as AuthEnv } from "../../_lib/auth";
import { Env as PEnv, getBalance, readLinkCounters, J } from "../../_lib/points";

export interface Env extends AuthEnv, PEnv {
  USERS: KVNamespace;
  LINKS: KVNamespace;
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
  const adm = await requireAdmin(ctx);
  // @ts-ignore
  if (adm instanceof Response) return adm;

  const url = new URL(ctx.request.url);
  const uid = (url.searchParams.get("uid") || "").trim();
  if (!uid) return J({ error: "uid required" }, 400);

  const raw = await ctx.env.USERS.get(`user:${uid}`);
  if (!raw) return J({ error: "not found" }, 404);

  let u: any = {};
  try { u = JSON.parse(raw); } catch {}
  const profile = {
    uid,
    email: u.email || "",
    role: u.role || "user",
    createdAt: u.createdAt || u.created_at || 0,
  };
  const balance = await getBalance(ctx.env as unknown as any, uid);

  // 找出該會員的分發（目前以掃描全部 "link:" 後過濾 owner==uid 的方式）
  const links: any[] = [];
  let cursor: string | undefined = undefined;
  do {
    const res = await ctx.env.LINKS.list({ prefix: "link:", cursor, limit: 100 });
    for (const k of res.keys) {
      const code = k.name.slice(5);
      const recRaw = await ctx.env.LINKS.get(k.name);
      if (!recRaw) continue;
      try {
        const rec = JSON.parse(recRaw);
        if ((rec.owner || rec.uid || "") === uid) {
          const c = await readLinkCounters(ctx.env as any, code);
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
