// functions/api/auth/login.ts
import { verifyPassword, signSession, setSessionCookie, hashPassword, Env } from "../_lib/auth";

type Body = { email?: string; password?: string };

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  let body: Body = {};
  try { body = await request.json(); } catch {}

  const emailRaw = (body.email || "").trim();
  const email = emailRaw.toLowerCase();
  const password = body.password || "";
  if (!emailRaw || !password) return json({ error: "MISSING_FIELDS" }, 400);

  // 1) 由 email 找 uid（先用小寫，再嘗試舊的原樣大小寫）
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

  // 3.5) 舊格式密碼：驗證成功後換成新格式
  if (needsRehash(user.pw)) {
    try {
      user.pw = await hashPassword(password);
      await env.USERS.put(`user:${uid}`, JSON.stringify(user));
    } catch (err) {
      console.error("PASSWORD_REHASH_FAIL", err);
    }
  }

  // 若是從大小寫敏感的舊鍵取得 uid，補上一個小寫鍵方便日後登入
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

function needsRehash(hash: string): boolean {
  if (!hash) return true;
  if (/^[0-9a-f]{64}$/i.test(hash)) return true; // legacy SHA-256
  if (!hash.startsWith("pbkd")) return true;

  if (hash.startsWith("pbkd$1$")) {
    const parts = hash.split("$");
    const iter = parseInt(parts[2] || "0", 10);
    return iter > 100_000 || iter <= 0;
  }

  const body = hash.slice(5);
  const parts = body.split(/[:$]/);
  const iter = parseInt(parts[1] || "0", 10);
  return iter > 100_000 || iter <= 0;
}

/* utils */
function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
