// functions/api/admin/users/list.ts
import { readCookie, verifySession, Env as AuthEnv } from "../../_lib/auth";

export interface Env extends AuthEnv {
  USERS: KVNamespace;
  ADMIN_EMAILS: string;
}

const J = (obj: any, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

async function requireAdmin(ctx: PagesFunction<Env>["context"]) {
  const sid = readCookie(ctx.request, "sid");
  const me = sid ? await verifySession(ctx.env.SESSION_SECRET, sid) : null;
  if (!me) return J({ error: "unauthorized" }, 401);

  const emails = (ctx.env.ADMIN_EMAILS || "")
    .toLowerCase()
    .split(/[,;\s]+/)
    .filter(Boolean);
  if (!emails.includes((me.email || "").toLowerCase())) {
    return J({ error: "forbidden" }, 403);
  }
  return me;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const ok = await requireAdmin(ctx);
  if (ok instanceof Response) return ok as unknown as Response;

  const url = new URL(ctx.request.url);
  const cursor = url.searchParams.get("cursor") || undefined;
  const limit = Math.min(100, Number(url.searchParams.get("limit") || "50") || 50);
  const q = (url.searchParams.get("q") || "").toLowerCase();

  const res = await ctx.env.USERS.list({ prefix: "user:", cursor, limit });

  const items = (await Promise.all(
    res.keys.map(async (k) => {
      const uid = k.name.slice(5); // user:<uid>
      let email = "";
      let role = "user";
      let createdAt = 0;

      const raw = await ctx.env.USERS.get(k.name);
      if (raw) {
        try {
          const u = JSON.parse(raw);
          email = u.email || "";
          createdAt = u.createdAt || u.created_at || 0;
          if (u.role === "admin" || u.is_admin) role = "admin";
        } catch {}
      }
      if (!email && uid.includes("@")) email = uid;

      return { email, uid, role, createdAt };
    })
  )).filter(u =>
    !q || (u.email && u.email.toLowerCase().includes(q)) || (u.uid && u.uid.toLowerCase().includes(q))
  );

  return J({
    ok: true,
    items,
    cursor: res.cursor,
    list_complete: res.list_complete,
  });
};
