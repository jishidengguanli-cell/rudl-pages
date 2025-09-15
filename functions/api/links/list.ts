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

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  try {
    const sid = readCookie(ctx.request, "sid");
    const me = sid ? await verifySession(ctx.env.SESSION_SECRET, sid) : null;
    if (!me) return j({ error: "unauthorized" }, 401);

    const LINKS = ctx.env.LINKS;
    const todayKey = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD

    // 讀取此使用者所有短碼
    const listKey = `user:${me.uid}:codes`;
    const raw = (await LINKS.get(listKey)) || "";
    const codes = raw.split("\n").filter(Boolean);

    const items: any[] = [];
    for (const code of codes) {
      const v = await LINKS.get(`link:${code}`);
      if (!v) continue;

      let rec: any;
      try { rec = JSON.parse(v); } catch { continue; }

      // 讀統計（整體 + 今日；另附上按平台的統計，未來要用得到）
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

      rec.stats = {
        total: n(totalAll),
        today: n(todayAll),
        apk_total: n(totalApk),
        ipa_total: n(totalIpa),
        apk_today: n(todayApk),
        ipa_today: n(todayIpa),
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

function n(v?: string | null) {
  return Number.parseInt(v || "0", 10) || 0;
}
