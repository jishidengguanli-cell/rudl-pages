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
const ITER = 100_000; // 預設迴圈（符合 Workers 限制）
const KEYLEN = 32;
const PBKDF2_SAFE_MAX = 100_000;

async function derivePbkdf2(password: string, salt: Uint8Array, iterations: number, keyLen: number): Promise<Uint8Array> {
  const pwdBytes = te.encode(password);

  if (iterations <= PBKDF2_SAFE_MAX) {
    const key = await crypto.subtle.importKey(
      "raw",
      pwdBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      key,
      keyLen * 8
    );
    return new Uint8Array(bits);
  }

  return pbkdf2Fallback(pwdBytes, salt, iterations, keyLen);
}

// ---- 以 WebCrypto PBKDF2 雜湊，產生新格式：pbkd$1$<iter>$<saltB64>$<dkB64> ----
export async function hashPassword(password: string): Promise<string> {
  const iterations = ITER;                       // 夠安全又不會太慢且符合 Workers 限制
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const dk = await derivePbkdf2(password, salt, iterations, KEYLEN);
  return `pbkd$1$${iterations}$${b64enc(salt)}$${b64enc(dk)}`;
}

// ---- 相容驗證：支援新舊多種分隔符（: 或 $）---- 
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (!stored) return false;

    if (/^[0-9a-f]{64}$/i.test(stored)) {
      return (await sha256Hex(password)) === stored.toLowerCase();
    }

    if (!stored.startsWith("pbkd")) return false;

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
    const dkBytes = await derivePbkdf2(password, salt, iterations, KEYLEN);
    const dk = b64enc(dkBytes);

    // 時序安全比較（簡化：長度相同再迭代比對）
    if (dk.length !== dkB64.length) return false;
    let ok = 0;
    for (let i = 0; i < dk.length; i++) ok |= dk.charCodeAt(i) ^ dkB64.charCodeAt(i);
    return ok === 0;
  } catch {
    return false;
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", te.encode(text));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- PBKDF2 fallback：純 JS 實作，支援超過 100k iterations ---------- */
function pbkdf2Fallback(password: Uint8Array, salt: Uint8Array, iterations: number, dkLen: number): Uint8Array {
  const blockCount = Math.ceil(dkLen / 32);
  const dk = new Uint8Array(blockCount * 32);
  const block = new Uint8Array(salt.length + 4);
  block.set(salt);

  const hmac = new HmacSha256(password);
  const u = new Uint8Array(32);
  const t = new Uint8Array(32);

  for (let blockIndex = 1; blockIndex <= blockCount; blockIndex++) {
    block[salt.length + 0] = (blockIndex >>> 24) & 0xff;
    block[salt.length + 1] = (blockIndex >>> 16) & 0xff;
    block[salt.length + 2] = (blockIndex >>> 8) & 0xff;
    block[salt.length + 3] = blockIndex & 0xff;

    hmac.reset();
    hmac.update(block);
    hmac.finish(u);
    t.set(u);

    for (let i = 1; i < iterations; i++) {
      hmac.reset();
      hmac.update(u);
      hmac.finish(u);
      for (let j = 0; j < 32; j++) t[j] ^= u[j];
    }

    dk.set(t, (blockIndex - 1) * 32);
  }

  hmac.clean();
  u.fill(0);
  t.fill(0);
  block.fill(0);
  return dk.slice(0, dkLen);
}

class HmacSha256 {
  private inner = new Sha256();
  private outer = new Sha256();
  private ipad = new Uint8Array(64);
  private opad = new Uint8Array(64);

  constructor(key: Uint8Array) {
    const blk = new Uint8Array(64);
    if (key.length > 64) {
      const hash = new Sha256();
      hash.update(key);
      hash.finish(blk);
    } else {
      blk.set(key);
    }
    for (let i = 0; i < 64; i++) {
      const k = blk[i];
      this.ipad[i] = k ^ 0x36;
      this.opad[i] = k ^ 0x5c;
    }
    this.inner.update(this.ipad);
    this.outer.update(this.opad);
    blk.fill(0);
  }

  reset() {
    this.inner.reset();
    this.outer.reset();
    this.inner.update(this.ipad);
    this.outer.update(this.opad);
  }

  update(data: Uint8Array) {
    this.inner.update(data);
  }

  finish(out: Uint8Array) {
    const ih = new Uint8Array(32);
    this.inner.finish(ih);
    this.outer.update(ih);
    this.outer.finish(out);
    ih.fill(0);
  }

  clean() {
    this.inner.clean();
    this.outer.clean();
    this.ipad.fill(0);
    this.opad.fill(0);
  }
}

class Sha256 {
  private state = new Int32Array(8);
  private buffer = new Uint8Array(64);
  private temp = new Int32Array(64);
  private bufferLength = 0;
  private bytesHashed = 0;
  private finished = false;

  private static readonly K = new Int32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  constructor() {
    this.reset();
  }

  reset() {
    this.state[0] = 0x6a09e667;
    this.state[1] = 0xbb67ae85;
    this.state[2] = 0x3c6ef372;
    this.state[3] = 0xa54ff53a;
    this.state[4] = 0x510e527f;
    this.state[5] = 0x9b05688c;
    this.state[6] = 0x1f83d9ab;
    this.state[7] = 0x5be0cd19;
    this.bufferLength = 0;
    this.bytesHashed = 0;
    this.finished = false;
  }

  clean() {
    this.state.fill(0);
    this.buffer.fill(0);
    this.temp.fill(0);
  }

  update(data: Uint8Array) {
    if (this.finished) throw new Error("SHA256: can't update because hash was finished.");
    let pos = 0;
    const len = data.length;
    this.bytesHashed += len;
    if (this.bufferLength > 0) {
      while (this.bufferLength < 64 && pos < len) {
        this.buffer[this.bufferLength++] = data[pos++];
      }
      if (this.bufferLength === 64) {
        this.hashBlocks(this.buffer, 0);
        this.bufferLength = 0;
      }
    }
    while (pos + 64 <= len) {
      this.hashBlocks(data, pos);
      pos += 64;
    }
    while (pos < len) {
      this.buffer[this.bufferLength++] = data[pos++];
    }
  }

  finish(out: Uint8Array) {
    if (!this.finished) {
      const bytesHashed = this.bytesHashed;
      const bitLenHi = (bytesHashed / 0x20000000) | 0;
      const bitLenLo = bytesHashed << 3;
      this.buffer[this.bufferLength++] = 0x80;
      if (this.bufferLength > 56) {
        while (this.bufferLength < 64) this.buffer[this.bufferLength++] = 0;
        this.hashBlocks(this.buffer, 0);
        this.bufferLength = 0;
      }
      while (this.bufferLength < 56) this.buffer[this.bufferLength++] = 0;
      this.buffer[56] = (bitLenHi >>> 24) & 0xff;
      this.buffer[57] = (bitLenHi >>> 16) & 0xff;
      this.buffer[58] = (bitLenHi >>> 8) & 0xff;
      this.buffer[59] = bitLenHi & 0xff;
      this.buffer[60] = (bitLenLo >>> 24) & 0xff;
      this.buffer[61] = (bitLenLo >>> 16) & 0xff;
      this.buffer[62] = (bitLenLo >>> 8) & 0xff;
      this.buffer[63] = bitLenLo & 0xff;
      this.hashBlocks(this.buffer, 0);
      this.finished = true;
    }
    for (let i = 0; i < 8; i++) {
      out[i * 4 + 0] = (this.state[i] >>> 24) & 0xff;
      out[i * 4 + 1] = (this.state[i] >>> 16) & 0xff;
      out[i * 4 + 2] = (this.state[i] >>> 8) & 0xff;
      out[i * 4 + 3] = this.state[i] & 0xff;
    }
  }

  private hashBlocks(data: Uint8Array, pos: number) {
    const { state, temp } = this;
    for (let i = 0; i < 16; i++) {
      const j = pos + (i << 2);
      temp[i] = ((data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3]) | 0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = temp[i - 15];
      const s1 = temp[i - 2];
      const gamma0 = ((s0 >>> 7) | (s0 << 25)) ^ ((s0 >>> 18) | (s0 << 14)) ^ (s0 >>> 3);
      const gamma1 = ((s1 >>> 17) | (s1 << 15)) ^ ((s1 >>> 19) | (s1 << 13)) ^ (s1 >>> 10);
      temp[i] = (temp[i - 16] + gamma0 + temp[i - 7] + gamma1) | 0;
    }
    let a = state[0], b = state[1], c = state[2], d = state[3];
    let e = state[4], f = state[5], g = state[6], h = state[7];
    for (let i = 0; i < 64; i++) {
      const sigma1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + sigma1 + ch + Sha256.K[i] + temp[i]) | 0;
      const sigma0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (sigma0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    state[0] = (state[0] + a) | 0;
    state[1] = (state[1] + b) | 0;
    state[2] = (state[2] + c) | 0;
    state[3] = (state[3] + d) | 0;
    state[4] = (state[4] + e) | 0;
    state[5] = (state[5] + f) | 0;
    state[6] = (state[6] + g) | 0;
    state[7] = (state[7] + h) | 0;
  }
}
