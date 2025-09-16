// functions/api/links/delete.ts
import { verifySession, Env as AuthEnv } from "../../_lib/auth"; // ← 若 _lib 在 api/_lib，改為 "../_lib/auth"

export interface Env extends AuthEnv {
  LINKS: KVNamespace;
  STATS?: KVNamespace; // 若統計分在另一個 namespace，可綁定上來（可選）
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
    if (rec.owner && rec.owner !== user.id && !user.admin) {
      return j({ error: "forbidden" }, 403);
    }

    // 4) 刪主紀錄
    await ctx.env.LINKS.delete(linkKey);

    // 5) 清掉相關統計/快取鍵（依你的實際前綴調整）
    await deleteByPrefix(ctx.env.LINKS, `cnt:${code}:`);      // 你目前已有的計數
    await deleteByPrefix(ctx.env.LINKS, `stats:${code}:`);
    await deleteByPrefix(ctx.env.LINKS, `hits:${code}:`);
    await deleteByPrefix(ctx.env.LINKS, `manifest:${code}:`);
    await ctx.env.LINKS.delete(`stats:${code}`);              // 若有總表鍵

    // 6) 若你把統計放在獨立 STATS namespace，也一併清掉（可選）
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
