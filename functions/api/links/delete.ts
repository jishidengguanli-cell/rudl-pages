// functions/api/links/delete.ts
import { readCookie, verifySession, Env as AuthEnv } from "../_lib/auth";

interface Env extends AuthEnv {
  LINKS: KVNamespace;            // 你的列表/統計都在 LINKS（或 FILES），這裡用 LINKS
  FILES_BUCKET?: R2Bucket;       // R2 綁定（從專案 Settings > Bindings 看到叫什麼就用什麼）
  R2_BUCKET_NAME?: string;       // 可選：你的 bucket 名稱，例如 "dist-files"
  ADMIN_EMAILS?: string;         // 管理員名單（逗號/空白分隔）
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    // --- 驗證登入 ---
    const sid = readCookie(ctx.request, "sid");
    const me  = sid ? await verifySession(ctx.env.SESSION_SECRET, sid) : null;
    if (!me) return json({ error: "unauthorized" }, 401);

    // --- 讀取 body ---
    const body = await ctx.request.json<any>().catch(() => ({}));
    const code = String(body.code || "").trim();
    if (!code) return json({ error: "code required" }, 400);

    // --- 取主紀錄並驗權 ---
    const key = `link:${code}`;
    const raw = await ctx.env.LINKS.get(key);
    if (!raw) return json({ ok: true }); // 已經不存在就當作成功
    const rec = JSON.parse(raw) as {
      owner?: string;
      apk_key?: string;
      ipa_key?: string;
      title?: string;
    };

    const adminEmails = (ctx.env.ADMIN_EMAILS || "")
      .toLowerCase()
      .split(/[,;\s]+/)
      .filter(Boolean);
    const isAdmin = adminEmails.includes(String(me.email || "").toLowerCase());
    if (rec.owner && rec.owner !== me.uid && !isAdmin) {
      return json({ error: "forbidden" }, 403);
    }

    // --- 刪 R2 物件（如果有）---
    const bucket = ctx.env.FILES_BUCKET;
    if (bucket) {
      await deleteR2IfExists(bucket, rec.apk_key, ctx.env.R2_BUCKET_NAME);
      await deleteR2IfExists(bucket, rec.ipa_key, ctx.env.R2_BUCKET_NAME);
    }

    // --- 從使用者清單移除該 code ---
    if (me.uid) {
      const listKey = `user:${me.uid}:codes`;
      const existing = (await ctx.env.LINKS.get(listKey)) || "";
      const lines = existing.split("\n").filter(Boolean).filter(c => c !== code);
      await ctx.env.LINKS.put(listKey, lines.join("\n"));
    }

    // --- 刪主紀錄 ---
    await ctx.env.LINKS.delete(key);

    // --- 刪統計/快取鍵（依你專案實際前綴調整）---
    await deleteByPrefix(ctx.env.LINKS, `cnt:${code}:`);
    await deleteByPrefix(ctx.env.LINKS, `stats:${code}:`);
    await deleteByPrefix(ctx.env.LINKS, `hits:${code}:`);
    await ctx.env.LINKS.delete(`stats:${code}`).catch(() => {});

    return json({ ok: true });
  } catch (e: any) {
    console.error("delete link failed:", e);
    return json({ error: "internal", detail: String(e?.message || e) }, 500);
  }
};

// ---------- helpers ----------
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
  try { await bucket.delete(key); } catch { /* ignore single delete error */ }
}

function toObjectKey(v?: string, bucketName?: string): string | undefined {
  if (!v) return;
  let s = String(v).trim();
  if (!s) return;

  // 支援完整 URL / r2.cloudflarestorage.com / 含 bucket 前綴的 key
  s = s.replace(/^\/+/, "");
  if (s.includes("://")) {
    try {
      const u = new URL(s);
      let p = u.pathname.replace(/^\/+/, "");
      const seg = p.split("/").filter(Boolean);
      if (/r2\.cloudflarestorage\.com$/i.test(u.hostname) && seg.length >= 3) {
        p = seg.slice(2).join("/");              // 去掉 /<account>/<bucket>/
      } else if (bucketName && p.startsWith(bucketName + "/")) {
        p = p.slice(bucketName.length + 1);
      }
      return p || undefined;
    } catch { /* ignore */ }
  }
  if (bucketName && s.startsWith(bucketName + "/")) s = s.slice(bucketName.length + 1);
  return s || undefined;
}
