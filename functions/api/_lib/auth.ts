// functions/api/_lib/auth.ts
// 提供：PBKDF2 雜湊/驗證密碼、簽發/驗證 HMAC session、cookie 工具

export interface Env {
  USERS: KVNamespace;
  SESSION_SECRET: string;
  SESSION_DAYS?: string;
}

// ===== Password hashing (PBKDF2-SHA256) =====
const ITER = 100_000;              // 13萬次
const SALT_BYTES = 16;             // 128-bit
const KEYLEN = 32;                 // 256-bit

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await pbkdf2(password, salt, ITER, KEYLEN);
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(key)}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
  if (scheme !== "pbkdf2") return false;
  const iter = parseInt(iterStr, 10);
  const salt = b64d(saltB64);
  const expect = b64d(hashB64);
  const got = await pbkdf2(password, salt, iter, expect.length);
  return timingSafeEqual(got, expect);
}
async function pbkdf2(password: string, salt: Uint8Array, iter: number, keyLen: number): Promise<Uint8Array> {
  // importKey 的第二個參數需要 BufferSource（Uint8Array 就是）
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
    keyMaterial,
    keyLen * 8
  );

  return new Uint8Array(bits);
}

// ===== Stateless session (HMAC-SHA256) =====
// payload 只放 uid、email、exp（秒）
export type SessionPayload = { uid: string; email: string; exp: number };

export async function signSession(secret: string, p: SessionPayload): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(p))}`;
  // hmacSha256 已經回傳 base64url 字串了，不要再做一次 b64url() ！
  const sig = await hmacSha256(secret, data);
  return `${data}.${sig}`;
}

export async function verifySession(secret: string, token: string): Promise<SessionPayload | null> {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  // 直接比對 base64url 字串
  const expected = await hmacSha256(secret, `${h}.${p}`);
  if (!timingSafeEqual(expected, s)) return null;

  const payload = JSON.parse(new TextDecoder().decode(b64urldBytes(p))) as SessionPayload;
  if (payload.exp * 1000 < Date.now()) return null;
  return payload;
}

async function hmacSha256(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return buf2b64url(sig);
}

// ===== Cookie helpers =====
export function setSessionCookie(token: string, days = 7): string {
  const maxAge = days * 24 * 60 * 60;
  return [
    `sid=${token}`,
    `Path=/`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`
  ].join("; ");
}
export function clearSessionCookie(): string {
  return `sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
export function readCookie(req: Request, name: string): string | null {
  const c = req.headers.get("cookie");
  if (!c) return null;
  const m = c.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

// ===== utils =====
function timingSafeEqual(a: Uint8Array | string, b: Uint8Array | string) {
  const A = typeof a === "string" ? new TextEncoder().encode(a) : a;
  const B = typeof b === "string" ? new TextEncoder().encode(b) : b;
  if (A.length !== B.length) return false;
  let out = 0;
  for (let i = 0; i < A.length; i++) out |= A[i] ^ B[i];
  return out === 0;
}
function b64(buf: Uint8Array) { return btoa(String.fromCharCode(...buf)); }
function b64d(s: string) {
  const bin = atob(s); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function b64url(s: string) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function b64urld(s: string) { return s.replace(/-/g,"+").replace(/_/g,"/"); }
function b64urldBytes(s: string) {
  s = b64urld(s); while (s.length % 4) s += "=";
  const bin = atob(s); const u = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
  return u;
}
function buf2b64url(buf: ArrayBuffer) {
  const u = new Uint8Array(buf);
  let s=""; for (let i=0;i<u.length;i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
