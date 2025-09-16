// functions/api/admin/links/delete.ts
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
  const emails = (ctx.env.ADMIN_EMAILS || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
  if (!emails.includes((me.email || "").toLowerCase())) return J({ error: "forbidden" }, 403);
  return me;
}

async function dropCode(env: Env, code: string) {
  await env.LINKS.delete(`link:${code}`);
  let cursor: string | undefined = undefined;
  do {
    const res = await env.LINKS.list({ prefix: `cnt:${code}:`, cursor, limit: 1000 });
    for (const k of res.keys) await env.LINKS.delete(k.name);
    cursor = res.cursor || undefined;
  } while (cursor);
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const ok = await requireAdmin(ctx);
  if (ok instanceof Response) return ok as unknown as Response;

  const body = await ctx.request.json().catch(() => ({}));
  let codes: string[] = [];
  if (Array.isArray(body.codes)) codes = body.codes;
  else if (body.code) codes = [body.code];

  codes = Array.from(new Set(codes.map((x: string) => (x || "").trim()).filter(Boolean)));
  if (!codes.length) return J({ error: "no codes" }, 400);

  for (const c of codes) await dropCode(ctx.env as any, c);
  return J({ ok: true, deleted: codes.length });
};
