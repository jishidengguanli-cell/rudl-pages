// functions/api/links/list.ts
import { readCookie, verifySession, Env as AuthEnv } from "../_lib/auth";

export interface Env extends AuthEnv {
  LINKS: KVNamespace;
}

function j(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const n = (v?: string | null) => Number.parseInt(v || "0", 10) || 0;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const sid = readCookie(ctx.request, "sid");
    const me = sid ? await verifySession(ctx.env.SESSION_SECRET, sid) : null;
    if (!me) return j({ error: "unauthorized" }, 401);

    const LINKS = ctx.env.LINKS;

    // 以 UTC 日期做 key（你的 /dl 統計若改成時區，這裡記得一致）
    const todayKey = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD

    // 讀取此使用者所有短碼
    const listKey = `user:${me.uid}:codes`;
    const raw = (await LINKS.get(listKey)) || "";
    const codes = raw.split("\n").filter(Boolean);

    const items: any[] = [];
    for (const code of codes) {
      // link 主紀錄
      const v = await LINKS.get(`link:${code}`);
      if (!v) continue;

      let rec: any;
      try {
        rec = JSON.parse(v);
      } catch {
        continue;
      }

      // 讀統計（整體 + 今日；另附上按平台的統計）
      const [
        totalAll,
        todayAll,
        totalApk, totalIpa,
        todayApk, todayIpa,
      ] = await Promise.all([
        LINKS.get(`cnt:${code}:total`),
        LINKS.get(`cnt:${code}:day:${todayKey}`),
        LINKS.get(`cnt:${code}:apk:total`),
        LINKS.get(`cnt:${code}:ipa:total`),
        LINKS.get(`cnt:${code}:apk:day:${todayKey}`),
        LINKS.get(`cnt:${code}:ipa:day:${todayKey}`),
      ]);

      const apk_total = n(totalApk);
      const ipa_total = n(totalIpa);
      const apk_today = n(todayApk);
      const ipa_today = n(todayIpa);

      // 「總計/今日」優先使用平台加總；若你也在維護 cnt:code:total，就取兩者較大者，避免不同步造成「卡在 500」或總數小於平台總和。
      const total = Math.max(n(totalAll), apk_total + ipa_total);
      const today = Math.max(n(todayAll), apk_today + ipa_today);

      rec.stats = {
        total,
        today,
        apk_total,
        ipa_total,
        apk_today,
        ipa_today,
      };

      items.push(rec);
    }

    // 依建立時間排序（新到舊）
    items.sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));

    return j({ items });
  } catch (e: any) {
    return j({ error: "internal", detail: String(e?.message || e) }, 500);
  }
};
