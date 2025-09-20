// functions/api/_lib/points.ts
// 共用：點數／流水／計數
import type { Env as AuthEnv } from "./auth";

export interface Env extends AuthEnv {
  POINTS: KVNamespace;
  USERS: KVNamespace;
  LINKS: KVNamespace;
}

export const J = (obj: any, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

// 每次下載成本
export const COST_PER_DOWNLOAD = { apk: 3, ipa: 5 } as const;

const nowTs = () => Date.now();
const rid = () => Math.random().toString(36).slice(2, 8);

export async function getUserEmail(env: Env, uid: string): Promise<string> {
  const raw = await env.USERS.get(`user:${uid}`);
  if (!raw) return "";
  try { return (JSON.parse(raw).email || "") as string; } catch { return ""; }
}

// ---- 餘額 ----
export async function getBalance(env: Env, uid: string): Promise<number> {
  const v = await env.POINTS.get(`points:${uid}`);
  return v ? Number(v) || 0 : 0;
}
export async function setBalance(env: Env, uid: string, value: number) {
  await env.POINTS.put(`points:${uid}`, String(Math.max(0, Math.floor(value))));
}

// ---- 流水 ----
export type LogKind = "spend" | "topup" | "admin_adjust";
export interface LogEntry {
  ts: number;
  delta: number;
  balance_after: number;
  kind: LogKind;
  code?: string;
  os?: "apk" | "ipa";
  note?: string;
  uid: string;
  email?: string;
  by?: string;
}
async function writeLedger(env: Env, uid: string, entry: LogEntry) {
  const key = `ptlog:${uid}:${String(entry.ts).padStart(13, "0")}-${rid()}`;
  await env.POINTS.put(key, JSON.stringify(entry));
}
export async function writeTopup(env: Env, entry: LogEntry & { amount: number }) {
  const key = `topup:${String(entry.ts).padStart(13, "0")}-${rid()}`;
  await env.POINTS.put(key, JSON.stringify(entry));
}

// ---- 1 分鐘只扣一次（回傳 deducted 表示本次是否「第一次」）----
export async function spendOncePerMinute(
  env: Env,
  uid: string,
  cost: number,
  meta: { code: string; os: "apk" | "ipa"; note?: string; by?: string }
): Promise<{ ok: true; balance: number; deducted: boolean } | { error: string }> {
  const coolKey = `ptcool:${uid}:${meta.code}:${meta.os}`;
  const existed = await env.POINTS.get(coolKey);
  if (existed) {
    // 冷卻期內：不扣、不記數
    const bal = await getBalance(env, uid);
    return { ok: true, balance: bal, deducted: false };
  }

  const bal = await getBalance(env, uid);
  if (bal < cost) return { error: "insufficient" };

  const newBal = bal - cost;
  await setBalance(env, uid, newBal);
  await env.POINTS.put(coolKey, "1", { expirationTtl: 60 }); // 1 分鐘冷卻

  const email = await getUserEmail(env, uid);
  const ts = nowTs();
  await writeLedger(env, uid, {
    ts, delta: -cost, balance_after: newBal, kind: "spend",
    code: meta.code, os: meta.os, note: meta.note, uid, email, by: meta.by
  });

  return { ok: true, balance: newBal, deducted: true };
}

// ---- 後台手動調整 ----
export async function adminAdjust(
  env: Env,
  uid: string,
  delta: number,
  adminEmail: string,
  note?: string
): Promise<{ balance: number }> {
  const old = await getBalance(env, uid);
  const newBal = Math.max(0, old + Math.floor(delta));
  await setBalance(env, uid, newBal);

  const email = await getUserEmail(env, uid);
  const ts = nowTs();
  const kind: LogKind = delta > 0 ? "topup" : "admin_adjust";
  await writeLedger(env, uid, { ts, delta, balance_after: newBal, kind, note, uid, email, by: adminEmail });
  if (delta > 0) await writeTopup(env, { ts, delta, balance_after: newBal, kind, note, uid, email, by: adminEmail, amount: delta });
  return { balance: newBal };
}

// ---- 統計鍵：UTC 天 ----
export function yyyymmdd(d = new Date()) { return d.toISOString().slice(0,10).replace(/-/g,""); }
async function incr(ns: KVNamespace, key: string) {
  const n = Number(await ns.get(key)) || 0;
  await ns.put(key, String(n + 1));
}
export async function incLinkCounters(env: Env, code: string, os: "apk" | "ipa") {
  const day = yyyymmdd();
  await Promise.all([
    incr(env.LINKS, `cnt${code}total`),
    incr(env.LINKS, `cnt${code}day:${day}`),
    incr(env.LINKS, `cnt${code}${os}total`),
    incr(env.LINKS, `cnt${code}${os}day:${day}`),
  ]);
}

// ---- 後台讀取用 ----
export async function readLinkCounters(env: Env, code: string) {
  const day = yyyymmdd();
  const [apkT, ipaT, totT, apkD, ipaD, totD] = await Promise.all([
    env.LINKS.get(`cnt${code}apktotal`),
    env.LINKS.get(`cnt${code}ipatotal`),
    env.LINKS.get(`cnt${code}total`),
    env.LINKS.get(`cnt${code}apkday:${day}`),
    env.LINKS.get(`cnt${code}ipaday:${day}`),
    env.LINKS.get(`cnt${code}day:${day}`),
  ]);
  return {
    apkTotal: Number(apkT || 0),
    ipaTotal: Number(ipaT || 0),
    total: Number(totT || 0),
    apkToday: Number(apkD || 0),
    ipaToday: Number(ipaD || 0),
    today: Number(totD || 0),
  };
}
