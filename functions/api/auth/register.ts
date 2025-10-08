// functions/api/auth/register.ts
import { hashPassword, signSession, setSessionCookie, Env } from "../_lib/auth";

type Body = { email?: string; password?: string };

function json(obj: any, status = 200) {
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
    // --- 讀取 body ---
    let body: Body = {};
    try { body = await request.json(); } catch {}
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    if (!email || !password) return json({ error: "MISSING_FIELDS" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "INVALID_EMAIL" }, 400);
    if (password.length < 6) return json({ error: "WEAK_PASSWORD" }, 400);

    // --- 取 KV 綁定（你專案是 USERS；若環境曾用別名，這裡也容錯）---
    const KV: KVNamespace | undefined = (env as any).USERS || (env as any).RUDL_USERS;
    if (!KV) return json({ error: "KV_BINDING_MISSING", detail: "Bind KV namespace to `USERS`." }, 500);

    // --- 需要的環境變數 ---
    const SESSION_SECRET = (env as any).SESSION_SECRET;
    const SESSION_DAYS = Number((env as any).SESSION_DAYS ?? 7) || 7;
    if (!SESSION_SECRET || typeof SESSION_SECRET !== "string") {
      return json({ error: "CONFIG_MISSING", field: "SESSION_SECRET" }, 500);
    }

    // 1) 檢查 email 是否已註冊
    const exists = await KV.get(`email:${email}`);
    if (exists) return json({ error: "EMAIL_EXISTS" }, 409);

    // 2) 建立帳號（沿用你現在 KV 結構）
    const uid = crypto.randomUUID();
    const pw = await hashPassword(password); // 會產生 "pbkd:..." 風格的字串
    const record = { id: uid, email, pw, createdAt: Date.now() };

    // 3) 寫入 KV （先 user 再 email 對映）
    await KV.put(`user:${uid}`, JSON.stringify(record));
    await KV.put(`email:${email}`, uid);

    // 4) 簽發 session 並回傳
    const token = await signSession(SESSION_SECRET, { uid, email }, SESSION_DAYS);
    const headers = new Headers({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    setSessionCookie(headers, token, SESSION_DAYS);

    return new Response(JSON.stringify({ ok: true, uid, email }), { headers });
  } catch (e: any) {
    // 把真正的錯誤回成 JSON，方便你在網頁 Network 看到細節
    return json({ error: "INTERNAL", detail: String(e?.message || e) }, 500);
  }
}
