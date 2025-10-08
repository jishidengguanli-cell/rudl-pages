/// <reference types="@cloudflare/workers-types" />

/**
 * Workers-friendly auth helpers（無 Node 型別）
 * 提供：
 *  - hashPassword / verifyPassword  (PBKDF2-SHA256)
 *  - signSession / verifySession    (HMAC-SHA256)
 *  - readCookie / setSessionCookie / clearSessionCookie
 *  - Env 介面（其他檔案有 import）
 */

export interface Env {
  USERS: KVNamespace;
  SESSION_SECRET: string;
  SESSION_DAYS?: number;
}

// ---- Base64 helpers（Workers 可用）----
const b64enc = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
const b64dec = (s: string) => new Uint8Array(atob(s).split("").map(c => c.charCodeAt(0)));

/* ---------- base64url ---------- */
const te = new TextEncoder();
const td = new TextDecoder();

// 為了修掉 TS 對 BufferSource 的嚴格推斷，統一做強轉
const BS = (v: unknown) => v as unknown as BufferSource;

function b64urlFromBytes(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function b64urlFromString(s: string): string { return b64urlFromBytes(te.encode(s)); }
function bytesFromB64url(b64u: string): Uint8Array {
  const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64u.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function stringFromB64url(b64u: string): string { return td.decode(bytesFromB64url(b64u)); }

/* ---------- HMAC-SHA256 (JWT-like) ---------- */
async function hmacSha256(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    BS(te.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, BS(te.encode(data)));
  return new Uint8Array(sig);
}

function timeSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let v = 0; for (let i = 0; i < a.length; i++) v |= a[i] ^ b[i];
  return v === 0;
}

export type SessionPayload = { uid: string; email?: string; exp: number };

export async function signSession(
  secret: string,
  payload: { uid: string; email?: string },
  days = 7
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body: SessionPayload = { uid: payload.uid, email: payload.email, exp: now + days * 86400 };

  const h = b64urlFromString(JSON.stringify(header));
  const p = b64urlFromString(JSON.stringify(body));
  const data = `${h}.${p}`;
  const sig = b64urlFromBytes(await hmacSha256(secret, data));
  return `${data}.${sig}`;
}

export async function verifySession(secret: string, token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  const parts = token.split("."); if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expect = await hmacSha256(secret, data);
  const got = bytesFromB64url(s);
  if (!timeSafeEqual(expect, got)) return null;

  let payload: SessionPayload;
  try { payload = JSON.parse(stringFromB64url(p)); } catch { return null; }
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) return null;
  return payload;
}

/* ---------- Cookie helpers ---------- */
export function readCookie(req: Request, name: string): string | "" {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(new RegExp("(?:^|;\\s*)" + name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}

export function setSessionCookie(headers: Headers, token: string, days = 7) {
  const maxAge = days * 86400;
  headers.append(
    "Set-Cookie",
    `sid=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Secure`
  );
}
export function clearSessionCookie(headers: Headers) {
  headers.append("Set-Cookie", "sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
}

/* ---------- PBKDF2-SHA256 ---------- */
const SALT_BYTES = 16;
const ITER = 120_000;
const KEYLEN = 32;

// ---- 以 WebCrypto PBKDF2 雜湊，產生新格式：pbkd$1$<iter>$<saltB64>$<dkB64> ----
export async function hashPassword(password: string): Promise<string> {
  const iterations = 120_000;                       // 夠安全又不會太慢
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();

  // importKey -> deriveBits（PBKDF2 + SHA-256）
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256 // 32 bytes
  );

  const dk = new Uint8Array(bits);
  return `pbkd$1$${iterations}$${b64enc(salt)}$${b64enc(dk)}`;
}

// ---- 相容驗證：支援新舊多種分隔符（: 或 $）---- 
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (!stored || !stored.startsWith("pbkd")) return false;

    let iterations = 0;
    let saltB64 = "";
    let dkB64 = "";

    // 新版：pbkd$1$<iter>$<salt>$<dk>
    if (stored.startsWith("pbkd$1$")) {
      const parts = stored.split("$"); // ["pbkd","1","<iter>","<salt>","<dk>"]
      iterations = parseInt(parts[2], 10) || 0;
      saltB64 = parts[3] || "";
      dkB64 = parts[4] || "";
    } else {
      // 舊版（常見）：pbkd:<salt>:<iter>:<dk>  或 pbkd$<salt>$<iter>$<dk>
      const body = stored.slice(5); // 去掉 "pbkd:"
      const parts = body.split(/[:$]/); // ":" 或 "$" 都吃
      if (parts.length >= 3) {
        // 慣例多半是 salt, iter, dk
        saltB64 = parts[0];
        iterations = parseInt(parts[1], 10) || 0;
        dkB64 = parts[2];
      }
    }

    if (!iterations || !saltB64 || !dkB64) return false;

    const salt = b64dec(saltB64);
    const enc = new TextEncoder();

    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      key,
      256
    );
    const dk = b64enc(new Uint8Array(bits));

    // 時序安全比較（簡化：長度相同再迭代比對）
    if (dk.length !== dkB64.length) return false;
    let ok = 0;
    for (let i = 0; i < dk.length; i++) ok |= dk.charCodeAt(i) ^ dkB64.charCodeAt(i);
    return ok === 0;
  } catch {
    return false;
  }
}
