// functions/api/auth/login.ts
import { verifyPassword, signSession, setSessionCookie, Env } from "../_lib/auth";

type Body = { email?: string; password?: string };

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  let body: Body = {};
  try { body = await request.json(); } catch {}

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) return json({ error: "MISSING_FIELDS" }, 400);

  // 1) 由 email 找 uid
  const uid = await env.USERS.get(`email:${email}`);
  if (!uid) return json({ error: "INVALID_CREDENTIALS" }, 401);

  // 2) 取出使用者資料
  const raw = await env.USERS.get(`user:${uid}`);
  if (!raw) return json({ error: "INVALID_CREDENTIALS" }, 401);

  let user: { id: string; email: string; pw: string };
  try { user = JSON.parse(raw); } catch { return json({ error: "BROKEN_USER" }, 500); }

  // 3) 驗證密碼
  const ok = await verifyPassword(password, user.pw);
  if (!ok) return json({ error: "INVALID_CREDENTIALS" }, 401);

  // 4) 簽發 session 並設 cookie
  const token = await signSession(env.SESSION_SECRET, { uid: user.id, email: user.email }, env.SESSION_DAYS ?? 7);
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  setSessionCookie(headers, token, env.SESSION_DAYS ?? 7);

  return new Response(JSON.stringify({ ok: true, uid: user.id, email: user.email }), { headers });
}

/* utils */
function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
