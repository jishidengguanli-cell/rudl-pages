// functions/api/auth/login.ts
import { verifyPassword, signSession, setSessionCookie, Env } from "../_lib/auth";

type Body = { email?: string; password?: string };

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  let body: Body = {};
  try { body = await request.json(); } catch {}

  const emailRaw = (body.email || "").trim();
  const email = emailRaw.toLowerCase();
  const password = body.password || "";
  if (!emailRaw || !password) return json({ error: "MISSING_FIELDS" }, 400);

  // 1) 由 email 找 uid（先小寫，再相容舊大小寫記錄）
  let uid = await env.USERS.get(`email:${email}`);
  let fetchedWithRaw = false;
  if (!uid && emailRaw !== email) {
    uid = await env.USERS.get(`email:${emailRaw}`);
    fetchedWithRaw = !!uid;
  }
  if (!uid) return json({ error: "INVALID_CREDENTIALS" }, 401);

  // 2) 取出使用者資料
  const raw = await env.USERS.get(`user:${uid}`);
  if (!raw) return json({ error: "INVALID_CREDENTIALS" }, 401);

  let user: { id: string; email: string; pw: string };
  try { user = JSON.parse(raw); } catch { return json({ error: "BROKEN_USER" }, 500); }

  // 3) 驗證密碼
  const ok = await verifyPassword(password, user.pw);
  if (!ok) return json({ error: "INVALID_CREDENTIALS" }, 401);

  // 若從舊大小寫鍵取到 uid，補寫小寫映射以便未來登入
  if (fetchedWithRaw) {
    try {
      await env.USERS.put(`email:${email}`, uid);
    } catch (err) {
      console.error("EMAIL_ALIAS_WRITE_FAIL", err);
    }
  }

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
