// functions/api/dl/bill.ts
import { J, spendOncePerMinute, incLinkCounters, COST_PER_DOWNLOAD } from "../_lib/points";

interface Env {
  LINKS: KVNamespace;
  POINTS: KVNamespace;
  USERS: KVNamespace;
}

/**
 * 記一次下載/安裝嘗試，並在 1 分鐘冷卻內避免重複扣點。
 * - 前端 Android 走：body { code, os: "apk" }
 * - 前端 iOS 走：body { code, os: "ipa" }（以 sendBeacon 或 fetch 送出）
 * - 後端 redirect（/functions/dl/[code].ts）背景上報：body { code, plat: "apk" | "ipa" }
 * 本 API 需同時相容 os/plat 兩種欄位。
 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // ---- 解析 body（允許 sendBeacon 的 text/plain 或無 Content-Type，只要內容是 JSON 即可）----
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // 仍嘗試以純文字再解析一次
    try {
      const text = await request.text();
      body = text ? JSON.parse(text) : {};
    } catch {
      body = {};
    }
  }

  const code = String(body.code || "").trim();

  // 兼容 os/plat/platform 以及 "ios" → "ipa"
  const rawPlat = String(body.os || body.plat || body.platform || "").toLowerCase();
  const os: "apk" | "ipa" = rawPlat === "ipa" || rawPlat === "ios" ? "ipa" : "apk";

  if (!code) return J({ error: "code required" }, 400, noStore());

  // ---- 讀取 link 記錄 ----
  const raw = await env.LINKS.get(`link:${code}`);
  if (!raw) return J({ error: "not found" }, 404, noStore());

  let rec: any = {};
  try {
    rec = JSON.parse(raw);
  } catch {
    return J({ error: "broken record" }, 500, noStore());
  }

  const ownerUid = rec.owner || rec.uid;
  if (!ownerUid) return J({ error: "owner missing" }, 400, noStore());

  const cost = COST_PER_DOWNLOAD[os] ?? 0;

  // ---- 扣點（含 1 分鐘冷卻）----
  // spendOncePerMinute(env, ownerUid, cost, meta) 預期：
  // - 冷卻內：{ deducted:false, balance:<int> }
  // - 首次/冷卻外：{ deducted:true, balance:<int> }
  // - 餘額不足：{ error:"insufficient" }
  const r = await spendOncePerMinute(env as any, ownerUid, cost, { code, os });

  if ("error" in r) {
    if (r.error === "insufficient") {
      return J({ error: "INSUFFICIENT_POINTS" }, 402, noStore());
    }
    return J({ error: r.error }, 400, noStore());
  }

  // ---- 遞增計數：僅在「實際扣點（deducted=true）」時才記一次 ----
  if (r.deducted) {
    try {
      await incLinkCounters(env as any, code, os);
    } catch {
      // 計數失敗不影響主要結果
    }
  }

  // 回傳更明確，以利前端/後端偵錯
  return J({ ok: true, os, deducted: !!r.deducted, balance: r.balance }, 200, noStore());
};

/* ---------------- helpers ---------------- */

function noStore() {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    pragma: "no-cache",
  };
}
