// functions/api/admin/users/reset-password.ts
import { readCookie, verifySession, Env as AuthEnv } from "../../_lib/auth";

export interface Env extends AuthEnv {
  USERS: KVNamespace;
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

// ======= 若你的 register.ts 有 hashPassword，請改用同一實作 =======
async function sha256Hex(text: string) {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const ok = await requireAdmin(ctx);
  if (ok instanceof Response) return ok as unknown as Response;

  const body = await ctx.request.json().catch(() => ({}));
  const uid = (body.uid || "").trim();
  const newPassword = (body.newPassword || "").trim();
  if (!uid) return J({ error: "uid required" }, 400);
  if (!newPassword || newPassword.length < 8) return J({ error: "password too short" }, 400);

  const key = `user:${uid}`;
  const raw = await ctx.env.USERS.get(key);
  if (!raw) return J({ error: "not found" }, 404);

  let u: any = {};
  try { u = JSON.parse(raw); } catch {}

  // ⚠️ 這裡要改成你註冊時的同一套雜湊方式
  u.pw = await sha256Hex(newPassword);

  await ctx.env.USERS.put(key, JSON.stringify(u));
  return J({ ok: true });
};
