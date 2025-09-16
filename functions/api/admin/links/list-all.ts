// functions/api/admin/links/list-all.ts
import { readCookie, verifySession, Env as AuthEnv } from "../../_lib/auth";

export interface Env extends AuthEnv {
  LINKS: KVNamespace;
  ADMIN_EMAILS: string;
}

const J = (obj: any, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function requireAdmin(ctx: PagesFunction<Env>["context"]) {
  const sid = readCookie(ctx.request, "sid");
  const me = sid ? await verifySession(ctx.env.SESSION_SECRET, sid) : null;
  if (!me) return J({ error: "unauthorized" }, 401);
  const emails = (ctx.env.ADMIN_EMAILS || "")
    .toLowerCase()
    .split(/[,;\s]+/)
    .filter(Boolean);
  if (!emails.includes((me.email || "").toLowerCase())) return J({ error: "forbidden" }, 403);
  return { me };
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const ok = await requireAdmin(ctx);
  // @ts-ignore - 簡單判斷 Response
  if (ok instanceof Response) return ok;

  const url = new URL(ctx.request.url);
  const cursor = (url.searchParams.get("cursor") || undefined) as string | undefined;
  const limit = Math.min(100, Number(url.searchParams.get("limit") || "50") || 50);

  const res = await ctx.env.LINKS.list({ prefix: "link:", cursor, limit });
  const todayKey = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const items = await Promise.all(
    res.keys.map(async (k) => {
      const code = k.name.slice(5);
      const raw = await ctx.env.LINKS.get(k.name);
      let rec: any = {};
      try {
        rec = raw ? JSON.parse(raw) : {};
      } catch {}

      const [totalAll, todayAll] = await Promise.all([
        ctx.env.LINKS.get(`cnt:${code}:total`),
        ctx.env.LINKS.get(`cnt:${code}:day:${todayKey}`),
      ]);

      return {
        code,
        owner: rec.owner || "",
        platform: rec.platform || rec.type || "",
        filename: rec.filename || rec.name || "",
        createdAt: rec.createdAt || rec.created_at || 0,
        total: Number(totalAll || 0),
        today: Number(todayAll || 0),
      };
    })
  );

  return J({ ok: true, items, cursor: res.cursor, list_complete: res.list_complete });
};
