// functions/api/links/delete.ts
// 刪除分發：刪 KV 主紀錄 + 統計鍵 + R2 APK/IPA 物件

// ⬇⬇⬇ 這行路徑請照你專案其它 API 的寫法（../_lib/auth 或 ../../_lib/auth）
import { verifySession, Env as AuthEnv } from "../_lib/auth";

interface Env extends AuthEnv {
  LINKS?: KVNamespace;       // 有些專案用 LINKS
  FILES?: KVNamespace;       // 你現有專案多半是 FILES
  STATS?: KVNamespace;       // 可選：獨立統計命名空間

  R2?: R2Bucket;             // R2 綁定可能叫 R2
  FILES_BUCKET?: R2Bucket;   // 或叫 FILES_BUCKET
  BUCKET?: R2Bucket;         // 或 BUCKET
  // 有時你會把完整 URL 存在 apk_key/ipa_key，這個名字用來去掉 /bucket-name/ 前綴
  R2_BUCKET_NAME?: string;   // 可選，例：dist-files
}

const json = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const { user } = await verifySession(ctx);
    if (!user?.id) return json({ error: "unauthorized" }, 401);

    const body = await ctx.request.json().catch(() => ({}));
    const code = String(body.code || "").trim();
    if (!code) return json({ error: "bad_request" }, 400);

    const KV = getLinksKV(ctx.env);
    if (!KV) return json({ error: "misconfigured", detail: "KV binding LINKS/FILES not found" }, 500);

    const key = `link:${code}`;
    const raw = await KV.get(key);
    if (!raw) return json({ ok: true }); // 已不存在，視為成功

    const rec = JSON.parse(raw);

    const isAdmin = !!(user.admin === true || user.role === "admin");
    if (!isAdmin && rec.owner && rec.owner !== user.id) {
      return json({ error: "forbidden" }, 403);
    }

    // 先刪 R2 物件
    const bucket = getR2Bucket(ctx.env);
    if (bucket) {
      await deleteR2IfExists(bucket, rec.apk_key, ctx.env.R2_BUCKET_NAME);
      await deleteR2IfExists(bucket, rec.ipa_key, ctx.env.R2_BUCKET_NAME);
    }

    // 刪 KV 主紀錄
    await KV.delete(key);

    // 清掉相關統計/快取鍵（依你的設計調整前綴）
    await deleteByPrefix(KV, `cnt:${code}:`);
    await deleteByPrefix(KV, `stats:${code}:`);
    await deleteByPrefix(KV, `hits:${code}:`);
    await deleteByPrefix(KV, `manifest:${code}:`);
    await KV.delete(`stats:${code}`); // 若有總表鍵

    // 若統計在獨立 STATS，也清掉
    if (ctx.env.STATS) {
      await deleteByPrefix(ctx.env.STATS, `${code}:`);
      await deleteByPrefix(ctx.env.STATS, `stats:${code}:`);
      await ctx.env.STATS.delete(`stats:${code}`);
    }

    return json({ ok: true });
  } catch (e: any) {
    // 把詳細錯誤丟到 logs，回傳給前端也帶 detail 方便你排錯
    console.error("delete link failed:", e);
    return json({ error: "internal", detail: String(e?.message || e) }, 500);
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
