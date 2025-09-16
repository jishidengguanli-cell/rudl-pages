// functions/api/links/delete.ts
// 刪除分發：刪 KV 主紀錄 + 統計鍵 + R2 物件 (APK/IPA)

import { verifySession, Env as AuthEnv } from "../../_lib/auth.ts"; // ← 若 _lib 在 api/_lib，改為 "../_lib/auth"

export interface Env extends AuthEnv {
  LINKS: KVNamespace;
  STATS?: KVNamespace; // 若統計在獨立命名空間，可（選）綁定
  R2?: R2Bucket;       // R2 綁定（建議用這個變數名）
  FILES?: R2Bucket;    // 也支援這幾個常見名稱
  FILES_BUCKET?: R2Bucket;
  BUCKET?: R2Bucket;
  R2_BUCKET_NAME?: string; // 可選，用來從完整 URL 去掉 bucket 名
}

const j = (obj: any, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    // 1) 驗證登入
    const { user } = await verifySession(ctx);
    if (!user?.id) return j({ error: "unauthorized" }, 401);

    // 2) 讀 body
    const body = await ctx.request.json().catch(() => ({}));
    const code = String(body.code || "").trim();
    if (!code) return j({ error: "bad_request" }, 400);

    // 3) 讀主紀錄並檢查擁有者
    const linkKey = `link:${code}`;
    const raw = await ctx.env.LINKS.get(linkKey);
    if (!raw) return j({ ok: true }); // 已不存在，視為成功

    const rec = JSON.parse(raw);
    // 管理員可以刪任何；非管理員必須是 owner
    if (!ctx.data?.user?.admin && rec.owner && rec.owner !== user.id) {
      // 有些 verifySession 會把 user 放在 ctx.data.user，為保險再取一次
      if (rec.owner !== user.id) return j({ error: "forbidden" }, 403);
    }

    // 4) 先刪 R2 物件（APK/IPA）
    const bucket = getBucket(ctx.env);
    if (bucket) {
      await deleteR2IfExists(bucket, rec.apk_key, ctx.env.R2_BUCKET_NAME);
      await deleteR2IfExists(bucket, rec.ipa_key, ctx.env.R2_BUCKET_NAME);
    }

    // 5) 刪 KV 主紀錄
    await ctx.env.LINKS.delete(linkKey);

    // 6) 清掉相關統計/快取鍵（依你的實際前綴調整）
    await deleteByPrefix(ctx.env.LINKS, `cnt:${code}:`);
    await deleteByPrefix(ctx.env.LINKS, `stats:${code}:`);
    await deleteByPrefix(ctx.env.LINKS, `hits:${code}:`);
    await deleteByPrefix(ctx.env.LINKS, `manifest:${code}:`);
    await ctx.env.LINKS.delete(`stats:${code}`); // 若有總表鍵

    // 7) 若統計放在獨立 STATS，也一併清掉
    if (ctx.env.STATS) {
      await deleteByPrefix(ctx.env.STATS, `${code}:`);
      await deleteByPrefix(ctx.env.STATS, `stats:${code}:`);
      await ctx.env.STATS.delete(`stats:${code}`);
    }

    return j({ ok: true });
  } catch (e: any) {
    return j({ error: "internal", detail: String(e?.message || e) }, 500);
  }
};

/** 取得 R2 bucket 綁定（容忍多個變數名） */
function getBucket(env: any): R2Bucket | undefined {
  return env.R2 || env.FILES || env.FILES_BUCKET || env.BUCKET;
}

/** 嘗試刪除 R2 物件：允許傳入 key 或 URL；缺少/不存在都視為成功 */
async function deleteR2IfExists(bucket: R2Bucket, rawKey?: string, bucketName?: string) {
  const key = normKey(rawKey, bucketName);
  if (!key) return;
  try {
    await bucket.delete(key);
  } catch {
    // 忽略錯誤，確保整體刪除流程不中斷
  }
}

/** 將可能是 URL 的字串轉為 R2 物件 key */
function normKey(v?: string, bucketName?: string): string | undefined {
  if (!v) return undefined;
  let s = String(v).trim();
  if (!s) return undefined;
  // 去掉開頭斜線
  s = s.replace(/^\/+/, "");

  // 若是 URL，取 pathname
  if (s.includes("://")) {
    try {
      const u = new URL(s);
      let p = u.pathname.replace(/^\/+/, ""); // 無前導斜線
      // r2 cloudflarestorage 格式：/{account}/{bucket}/{key...}
      const seg = p.split("/").filter(Boolean);
      if (/r2\.cloudflarestorage\.com$/i.test(u.hostname) && seg.length >= 3) {
        p = seg.slice(2).join("/");
      } else if (bucketName && p.startsWith(bucketName + "/")) {
        // 自訂網域但 path 內帶了 bucket 名（例如 /dist-files/xxx）
        p = p.slice(bucketName.length + 1);
      }
      return p || undefined;
    } catch { /* fallthrough */ }
  }

  // 非 URL；若字串以 bucketName/ 開頭，去掉
  if (bucketName && s.startsWith(bucketName + "/")) {
    s = s.slice(bucketName.length + 1);
  }
  return s || undefined;
}

/** 依 prefix 批次刪除 KV keys */
async function deleteByPrefix(ns: KVNamespace, prefix: string) {
  let cursor: string | undefined = undefined;
  do {
    const res = await ns.list({ prefix, cursor });
    if (res.keys.length) {
      await Promise.all(res.keys.map((k) => ns.delete(k.name)));
    }
    cursor = res.cursor;
  } while (cursor);
}
