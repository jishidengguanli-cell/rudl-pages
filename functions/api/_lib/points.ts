// functions/api/_lib/points.ts
// 共用點數／流水／分發計數工具（不動你現有的 points:<uid> 餘額鍵）

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

const nowTs = () => Date.now();
const rid = () => Math.random().toString(36).slice(2, 8);

export async function getUserEmail(env: Env, uid: string): Promise<string> {
  const raw = await env.USERS.get(`user:${uid}`);
  if (!raw) return "";
  try { return (JSON.parse(raw).email || "") as string; } catch { return ""; }
}

// —— 餘額（沿用 points:<uid>）——
export async function getBalance(env: Env, uid: string): Promise<number> {
  const v = await env.POINTS.get(`points:${uid}`);
  return v ? Number(v) || 0 : 0;
}
export async function setBalance(env: Env, uid: string, value: number) {
  await env.POINTS.put(`points:${uid}`, String(Math.max(0, Math.floor(value))));
}

// —— 流水 ——
// ptlog:<uid>:<ts>-<rand>  （單人流水）
// topup:<ts>-<rand>        （全站充值彙總）
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

// —— 1 分鐘只扣一次（以 uid+code+os 判斷）——
export async function spendOncePerMinute(
  env: Env,
  uid: string,
  cost: number,
  meta: { code: string; os: "apk" | "ipa"; note?: string; by?: string }
): Promise<{ ok: true; balance: number } | { error: string }> {
  const coolKey = `ptcool:${uid}:${meta.code}:${meta.os}`;
  const existed = await env.POINTS.get(coolKey);
  if (existed) {
    const bal = await getBalance(env, uid);
    return { ok: true, balance: bal };
  }
  const bal = await getBalance(env, uid);
  if (bal < cost) return { error: "insufficient" };

  const newBal = bal - cost;
  await setBalance(env, uid, newBal);
  await env.POINTS.put(coolKey, "1", { expirationTtl: 60 });

  const email = await getUserEmail(env, uid);
  const ts = nowTs();
  await writeLedger(env, uid, {
    ts, delta: -cost, balance_after: newBal, kind: "spend",
    code: meta.code, os: meta.os, note: meta.note, uid, email, by: meta.by
  });
  return { ok: true, balance: newBal };
}

// —— 後台手動調整（正負皆可；正數=topup，負數=admin_adjust）——
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

  await writeLedger(env, uid, {
    ts, delta, balance_after: newBal, kind, note, uid, email, by: adminEmail
  });

  if (delta > 0) {
    await writeTopup(env, {
      ts, delta, balance_after: newBal, kind, note, uid, email, by: adminEmail, amount: delta
    });
  }
  return { balance: newBal };
}

// —— 分發計數讀取（依你現存鍵名 cnt<code>apktotal/ipatotal/total + day）——
export function yyyymmdd(d = new Date()) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
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
