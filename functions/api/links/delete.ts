// functions/api/links/delete.ts
// 刪除分發：刪 KV 主紀錄 + 統計鍵 + R2 APK/IPA 物件

// ⬇⬇⬇ 這行路徑請照你專案其它 API 的寫法（../_lib/auth 或 ../../_lib/auth）
import { verifySession, Env as AuthEnv } from "../_lib/auth";

interface Env extends AuthEnv {
  LINKS?: KVNamespace;       // 有些專案用 LINKS
  // FILES?: KVNamespace;       // 你現有專案多半是 FILES
  STATS?: KVNamespace;       // 可選：獨立統計命名空間

  // R2?: R2Bucket;             // R2 綁定可能叫 R2
  FILES_BUCKET?: R2Bucket;   // 或叫 FILES_BUCKET
  // BUCKET?: R2Bucket;         // 或 BUCKET
  // 有時你會把完整 URL 存在 apk_key/ipa_key，這個名字用來去掉 /bucket-name/ 前綴
  // R2_BUCKET_NAME?: string;   // 可選，例：dist-files
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const { request, env } = ctx;

    // 檢查登入
    const cookies = readCookie(request);
    const me = await verifySession(env, cookies);
    if (!me?.ok) return json({ error: 'unauthorized' }, 401);

    // 讀 body
    const { code } = await request.json().catch(() => ({}));
    if (!code || typeof code !== 'string') {
      return json({ error: 'missing code' }, 400);
    }

    // 取出分發資料（要拿到檔案 key 才能刪 R2）
    const link = await env.LINKS.get(code, { type: 'json' }) as
      | { apk_key?: string; ipa_key?: string }
      | null;

    // 刪除 R2 檔案（存在才刪，失敗不影響主要流程）
    if (link?.apk_key) {
      try { await env.FILES_BUCKET.delete(link.apk_key); } catch { /* ignore */ }
    }
    if (link?.ipa_key) {
      try { await env.FILES_BUCKET.delete(link.ipa_key); } catch { /* ignore */ }
    }

    // 刪除 KV 的 link（以及如有 STATS 的話也一併刪）
    await env.LINKS.delete(code).catch(() => {});
    if (env.STATS) await env.STATS.delete(code).catch(() => {});

    return json({ ok: true });
  } catch (e: any) {
    return json({ error: e?.message || 'internal' }, 500);
  }
};
// ---- helpers ----
function getLinksKV(env: Env): KVNamespace | undefined {
  return env.LINKS || env.FILES;
}
function getR2Bucket(env: Env): R2Bucket | undefined {
  return env.R2 || env.FILES_BUCKET || (env as any).FILES || env.BUCKET;
}
async function deleteByPrefix(ns: KVNamespace, prefix: string) {
  let cursor: string | undefined;
  do {
    const res = await ns.list({ prefix, cursor });
    if (res.keys.length) await Promise.all(res.keys.map(k => ns.delete(k.name)));
    cursor = res.cursor;
  } while (cursor);
}
async function deleteR2IfExists(bucket: R2Bucket, rawKey?: string, bucketName?: string) {
  const key = toObjectKey(rawKey, bucketName);
  if (!key) return;
  try { await bucket.delete(key); } catch (e) { console.warn("R2 delete warn:", rawKey, e); }
}
function toObjectKey(v?: string, bucketName?: string): string | undefined {
  if (!v) return;
  let s = String(v).trim();
  if (!s) return;
  s = s.replace(/^\/+/, "");
  if (s.includes("://")) {
    try {
      const u = new URL(s);
      let p = u.pathname.replace(/^\/+/, "");
      const seg = p.split("/").filter(Boolean);
      if (/r2\.cloudflarestorage\.com$/i.test(u.hostname) && seg.length >= 3) {
        p = seg.slice(2).join("/");
      } else if (bucketName && p.startsWith(bucketName + "/")) {
        p = p.slice(bucketName.length + 1);
      }
      return p || undefined;
    } catch { /* ignore */ }
  }
  if (bucketName && s.startsWith(bucketName + "/")) s = s.slice(bucketName.length + 1);
  return s || undefined;
}
