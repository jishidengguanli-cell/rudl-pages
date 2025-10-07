// functions/api/links/list.ts
import { readCookie, verifySession, Env as AuthEnv } from "../_lib/auth";
import { readLinkCounters } from "../_lib/points";

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

    // 此會員的所有短碼
    const listKey = `user:${me.uid}:codes`;
    const raw = (await LINKS.get(listKey)) || "";
    const codes = raw.split("\n").filter(Boolean);

    const items: any[] = [];
    for (const code of codes) {
      const recRaw = await LINKS.get(`link:${code}`);
      if (!recRaw) continue;
      let rec: any;
      try { rec = JSON.parse(recRaw); } catch { continue; }

      // 與後台一致：共用 readLinkCounters()
      const c = await readLinkCounters(ctx.env as any, code);

      items.push({
        ...rec,
        // 與後台命名對齊（admin_user.html 也是看這些欄位）
        apkTotal: c.apkTotal,
        ipaTotal: c.ipaTotal,
        total:    c.total,
        apkToday: c.apkToday,
        ipaToday: c.ipaToday,
        today:    c.today,
      });
    }

    // 依建立時間新→舊
    items.sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));
    return j({ items });
  } catch (e: any) {
    return j({ error: "internal", detail: String(e?.message || e) }, 500);
  }
};
