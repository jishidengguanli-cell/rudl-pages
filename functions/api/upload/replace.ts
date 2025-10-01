// functions/api/upload/replace.ts
// 用途：在使用 /api/upload/init 取得預簽名 URL 並 PUT 成功後，呼叫本端點
// 作用：把新 key 寫回 link 記錄（apk_key 或 ipa_key），並刪除舊的 R2 物件（若 key 不同）
//
// 權限：僅限 link.owner === 當前登入者 uid
//
// 請求：POST JSON
// {
//   "code": "abcd12",
//   "platform": "apk" | "ipa",
//   "key": "android/1696137600000-XXXX.apk" // 由 /api/upload/init 回傳
// }
//
// 回應：200 { ok: true, code, platform, key, deletedOld?: string }
//       400/401/403/404/500 對應錯誤

import { verifySession } from "../_lib/auth";

export interface Env {
  LINKS: KVNamespace;
  FILES_BUCKET: R2Bucket;
}

type Body = {
  code?: string;
  platform?: "apk" | "ipa";
  key?: string; // R2 物件 key（非 CDN URL）
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    // 1) 權限檢查
    const cookie = ctx.request.headers.get("cookie") || "";
    const me = await verifySession(cookie, ctx.env);
    if (!me) return json({ error: "unauthorized" }, 401);

    // 2) 解析 body
    const body = (await ctx.request.json()) as Body;
    const code = String(body?.code || "").trim();
    const platform = body?.platform;
    const newKey = String(body?.key || "").trim();

    if (!code) return json({ error: "code required" }, 400);
    if (!platform || !["apk", "ipa"].includes(platform)) {
      return json({ error: "platform must be 'apk' or 'ipa'" }, 400);
    }
    if (!newKey) return json({ error: "key required" }, 400);

    // 3) 讀取 link
    const linkKey = `link:${code}`;
    const raw = await ctx.env.LINKS.get(linkKey);
    if (!raw) return json({ error: "link not found" }, 404);

    type Rec = {
      code: string;
      owner: string;
      title?: string;
      version?: string;
      bundle_id?: string;
      apk_key?: string; // 可能是 R2 物件 key 或完整 CDN URL（刪除時要轉回 key）
      ipa_key?: string;
      ipaMeta?: { bundle_id?: string; version?: string };
      createdAt?: number;
      updatedAt?: number;
    };

    const rec = JSON.parse(raw) as Rec;
    if (rec.owner !== me.uid) return json({ error: "forbidden" }, 403);

    // 4) 取得舊 key（依平台）
    const oldKeyRaw = platform === "apk" ? rec.apk_key : rec.ipa_key;
    const oldKey = normalizeObjectKey(oldKeyRaw);

    // 5) 如果新舊相同，就不刪除，僅更新 updatedAt
    let deletedOld: string | undefined = undefined;
    if (oldKey && oldKey !== newKey) {
      // 先刪除舊 R2 物件（忽略不存在錯誤）
      try {
        await ctx.env.FILES_BUCKET.delete(oldKey);
        deletedOld = oldKey;
      } catch (_e) {
        // 靜默忽略
      }
    }

    // 6) 寫回新 key
    if (platform === "apk") {
      rec.apk_key = newKey; // 只存物件 key：android/xxx.apk
    } else {
      rec.ipa_key = newKey;
      // 可選：這裡你若想重置 ipaMeta，也可以保留/清空；先保留舊值
      // rec.ipaMeta = undefined;
    }
    rec.updatedAt = Date.now();

    await ctx.env.LINKS.put(linkKey, JSON.stringify(rec));

    return json({ ok: true, code, platform, key: newKey, deletedOld });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
};

// ---- helpers ----
function normalizeObjectKey(v?: string): string | undefined {
  if (!v) return undefined;
  // 若存的是完整 CDN URL，需去掉域名前綴，只留下 bucket 內部 key
  // 例：https://cdn.rudownload.win/android/xxxxx.apk -> android/xxxxx.apk
  try {
    if (/^https?:\/\//i.test(v)) {
      const u = new URL(v);
      // 移除開頭的斜線
      return u.pathname.replace(/^\/+/, "");
    }
    return v;
  } catch {
    return v;
  }
}

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
