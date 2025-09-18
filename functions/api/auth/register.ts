// functions/api/auth/register.ts
import { hashPassword, signSession, setSessionCookie, Env } from "../_lib/auth";

type Body = { email?: string; password?: string };

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  let body: Body = {};
  try { body = await request.json(); } catch {}

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) return json({ error: "MISSING_FIELDS" }, 400);

  // 1) 檢查是否已存在
  const exists = await env.USERS.get(`email:${email}`);
  if (exists) return json({ error: "EMAIL_EXISTS" }, 409);

  // 2) 產生 uid + 雜湊密碼
  const uid = crypto.randomUUID();
  const pw = await hashPassword(password);
  const record = { id: uid, email, pw, createdAt: Date.now() };

  // 3) 寫入 KV
  await env.USERS.put(`user:${uid}`, JSON.stringify(record));
  await env.USERS.put(`email:${email}`, uid);

  // 4) 簽發 session 並設 cookie
  const token = await signSession(env.SESSION_SECRET, { uid, email }, env.SESSION_DAYS ?? 7);
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  setSessionCookie(headers, token, env.SESSION_DAYS ?? 7);

  return new Response(JSON.stringify({ ok: true, uid, email }), { headers });
}

/* utils */
function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
