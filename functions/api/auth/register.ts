// functions/api/auth/register.ts
import { hashPassword, signSession, setSessionCookie, Env } from "../_lib/auth";

type Body = { email?: string; password?: string };

function J(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  try {
    // ------- 讀 body 與基本驗證 -------
    let body: Body = {};
    try { body = await request.json(); } catch {}
    const emailRaw = (body.email || "").trim();
    const email = emailRaw.toLowerCase();
    const password = body.password || "";

    if (!emailRaw || !password) return J({ error: "MISSING_FIELDS" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) return J({ error: "INVALID_EMAIL" }, 400);
    if (password.length < 6) return J({ error: "WEAK_PASSWORD" }, 400);

    // ------- 綁定與環境變數 -------
    const KV: KVNamespace | undefined = (env as any).USERS || (env as any).RUDL_USERS;
    if (!KV) return J({ error: "KV_BINDING_MISSING", detail: "Bind KV namespace to `USERS`." }, 500);

    const SESSION_SECRET = (env as any).SESSION_SECRET;
    const SESSION_DAYS = Number((env as any).SESSION_DAYS ?? 7) || 7;
    if (!SESSION_SECRET || typeof SESSION_SECRET !== "string" || !SESSION_SECRET.trim()) {
      return J({ error: "CONFIG_MISSING", field: "SESSION_SECRET" }, 500);
    }

    // ------- 檢查 email 是否已註冊 -------
    try {
      const lowerExists = await KV.get(`email:${email}`);
      const rawExists = emailRaw !== email ? await KV.get(`email:${emailRaw}`) : null;
      if (lowerExists || rawExists) return J({ error: "EMAIL_EXISTS" }, 409);
    } catch (e: any) {
      console.error("KV_READ_FAIL(email->uid)", e);
      return J({ error: "KV_READ_FAIL", detail: String(e?.message || e) }, 500);
    }

    // ------- 雜湊密碼（與後台一致 pbkd 風格） -------
    let pw: string;
    try {
      pw = await hashPassword(password);
    } catch (e: any) {
      console.error("HASH_FAIL", e);
      return J({ error: "HASH_FAIL", detail: String(e?.message || e) }, 500);
    }

    // ------- 建立 user record 並寫入 KV -------
    const uid = crypto.randomUUID();
    const record = { id: uid, email, pw, createdAt: Date.now() };

    try {
      // 先寫 user，再寫 email 映射
      await KV.put(`user:${uid}`, JSON.stringify(record));
      await KV.put(`email:${email}`, uid);
      if (emailRaw !== email) await KV.put(`email:${emailRaw}`, uid);
    } catch (e: any) {
      console.error("KV_WRITE_FAIL(user/email)", e);
      return J({ error: "KV_WRITE_FAIL", detail: String(e?.message || e) }, 500);
    }

    // ------- 簽發 session 並回 cookie -------
    let token: string;
    try {
      token = await signSession(SESSION_SECRET, { uid, email }, SESSION_DAYS);
    } catch (e: any) {
      console.error("SIGN_FAIL", e);
      return J({ error: "SIGN_FAIL", detail: String(e?.message || e) }, 500);
    }

    const headers = new Headers({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    setSessionCookie(headers, token, SESSION_DAYS);

    return new Response(JSON.stringify({ ok: true, uid, email }), { headers });
  } catch (e: any) {
    console.error("INTERNAL", e);
    return J({ error: "INTERNAL", detail: String(e?.message || e) }, 500);
  }
}
