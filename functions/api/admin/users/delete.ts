// functions/api/admin/users/delete.ts
import { readCookie, verifySession, Env as AuthEnv } from "../../_lib/auth";

export interface Env extends AuthEnv {
  USERS: KVNamespace;
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

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const ok = await requireAdmin(ctx);
  if (ok instanceof Response) return ok as unknown as Response;

  const body = await ctx.request.json().catch(() => ({}));
  const uid = (body.uid || "").trim();
  const cascade = !!body.cascade; // 若為真，會同時刪除該使用者的分發
  if (!uid) return J({ error: "uid required" }, 400);

  const ukey = `user:${uid}`;
  const raw = await ctx.env.USERS.get(ukey);
  if (!raw) return J({ error: "not found" }, 404);

  let u: any = {};
  try { u = JSON.parse(raw); } catch {}
  const email = (u.email || "").toLowerCase();

  // 刪 email 索引
  if (email) await ctx.env.USERS.delete(`email:${email}`);
  // 刪 user 主檔
  await ctx.env.USERS.delete(ukey);

  // 連帶刪除該使用者的分發（可選）
  if (cascade && ctx.env.LINKS) {
    let cursor: string | undefined = undefined;
    do {
      const list = await ctx.env.LINKS.list({ prefix: "link:", cursor, limit: 100 });
      for (const k of list.keys) {
        const raw = await ctx.env.LINKS.get(k.name);
        if (!raw) continue;
        try {
          const rec = JSON.parse(raw);
          if ((rec.owner || "").toLowerCase() === email) {
            const code = k.name.slice(5);
            await ctx.env.LINKS.delete(k.name);
            // 清計數
            let ccur: string | undefined = undefined;
            do {
              const cnts = await ctx.env.LINKS.list({ prefix: `cnt:${code}:`, cursor: ccur, limit: 1000 });
              for (const ck of cnts.keys) await ctx.env.LINKS.delete(ck.name);
              ccur = cnts.cursor || undefined;
            } while (ccur);
          }
        } catch {}
      }
      cursor = list.cursor || undefined;
    } while (cursor);
  }

  return J({ ok: true });
};
