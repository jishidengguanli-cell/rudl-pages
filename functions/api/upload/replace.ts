// functions/api/upload/replace.ts
// 目的：前端用 /api/upload/init 直傳到 R2 成功後，再呼叫本端點：
//       1) 把新 key 寫回 link（apk_key / ipa_key）
//       2) 若舊 key 與新 key 不同，刪除舊的 R2 物件
//
// 權限：僅 link.owner === 目前登入者
//
// 請求：POST JSON
// { "code": "abcd12", "platform": "apk" | "ipa", "key": "android/1690000000-XXXX.apk" }

import { readCookie, verifySession, Env as AuthEnv } from "../_lib/auth";

export interface Env extends AuthEnv {
  LINKS: KVNamespace;
  FILES_BUCKET: R2Bucket;
}

type Body = {
  code?: string;
  platform?: "apk" | "ipa";
  key?: string; // R2 物件 key（非完整 CDN URL）
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    // 正確做法：從 cookie 讀 sid，再拿 SESSION_SECRET 驗證
    const sid = readCookie(ctx.request, "sid");
    const me = sid ? await verifySession(ctx.env.SESSION_SECRET, sid) : null;
    if (!me) return json({ error: "unauthorized" }, 401);

    const body = (await ctx.request.json()) as Body;
    const code = String(body?.code || "").trim();
    const platform = body?.platform;
    const newKey = String(body?.key || "").trim();

    if (!code) return json({ error: "code required" }, 400);
    if (!platform || !["apk", "ipa"].includes(platform)) {
      return json({ error: "platform must be 'apk' or 'ipa'" }, 400);
    }
    if (!newKey) return json({ error: "key required" }, 400);

    const linkKey = `link:${code}`;
    const raw = await ctx.env.LINKS.get(linkKey);
    if (!raw) return json({ error: "link not found" }, 404);

    type Rec = {
      code: string;
      owner: string;
      title?: string;
      version?: string;
      bundle_id?: string;
      apk_key?: string;
      ipa_key?: string;
      ipaMeta?: { bundle_id?: string; version?: string };
      createdAt?: number;
      updatedAt?: number;
    };

    const rec = JSON.parse(raw) as Rec;
    if (rec.owner !== me.uid) return json({ error: "forbidden" }, 403);

    // 舊 key → 轉為純物件 key（若歷史資料存過完整 URL）
    const oldKeyRaw = platform === "apk" ? rec.apk_key : rec.ipa_key;
    const oldKey = normalizeObjectKey(oldKeyRaw);

    // 刪舊（若與新 key 不同）
    let deletedOld: string | undefined = undefined;
    if (oldKey && oldKey !== newKey) {
      try {
        await ctx.env.FILES_BUCKET.delete(oldKey);
        deletedOld = oldKey;
      } catch {
        // 忽略不存在等錯誤
      }
    }

    // 寫入新 key
    if (platform === "apk") {
      rec.apk_key = newKey;
    } else {
      rec.ipa_key = newKey;
      // 視需求可清空 ipaMeta；這裡先保留
      // rec.ipaMeta = undefined;
    }
    rec.updatedAt = Date.now();

    await ctx.env.LINKS.put(linkKey, JSON.stringify(rec));
    return json({ ok: true, code, platform, key: newKey, deletedOld });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
};

function normalizeObjectKey(v?: string): string | undefined {
  if (!v) return undefined;
  try {
    if (/^https?:\/\//i.test(v)) {
      const u = new URL(v);
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
