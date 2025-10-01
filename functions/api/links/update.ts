// functions/api/links/update.ts
// 僅更新「顯示用欄位」，不會動到 apk_key / ipa_key（避免把沒更新的包清空）
//
// 請求：POST JSON
// { code, title?, version?, bundle_id?, lang? }

import { readCookie, verifySession, Env as AuthEnv } from "../_lib/auth";

export interface Env extends AuthEnv {
  LINKS: KVNamespace;
}

type Body = {
  code?: string;
  title?: string;
  version?: string;
  bundle_id?: string;
  lang?: string;
  // 可能被前端誤傳的欄位，一律忽略：
  apk_key?: any;
  ipa_key?: any;
  apk_url?: any;
  ipa_url?: any;
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const sid = readCookie(ctx.request, "sid");
    const me = sid ? await verifySession(ctx.env.SESSION_SECRET, sid) : null;
    if (!me) return json({ error: "unauthorized" }, 401);

    const body = (await ctx.request.json()) as Body;
    const code = String(body?.code || "").trim();
    if (!code) return json({ error: "code required" }, 400);

    const linkKey = `link:${code}`;
    const raw = await ctx.env.LINKS.get(linkKey);
    if (!raw) return json({ error: "link not found" }, 404);

    type Rec = {
      code: string;
      owner: string;
      title?: string;
      version?: string;
      bundle_id?: string;
      lang?: string;
      apk_key?: string;
      ipa_key?: string;
      ipaMeta?: { bundle_id?: string; version?: string };
      createdAt?: number;
      updatedAt?: number;
    };

    const rec = JSON.parse(raw) as Rec;
    if (rec.owner !== me.uid) return json({ error: "forbidden" }, 403);

    // 只允許更新這些欄位（空字串將被忽略、代表「不變」）
    const next: Partial<Rec> = {};
    setIfString(next, "title", body.title);
    setIfString(next, "version", body.version);
    setIfString(next, "bundle_id", body.bundle_id);
    setIfString(next, "lang", body.lang);

    // 絕對不允許在這支 API 里影響包的欄位
    delete (body as any).apk_key;
    delete (body as any).ipa_key;
    delete (body as any).apk_url;
    delete (body as any).ipa_url;

    const updated: Rec = {
      ...rec,
      ...next,
      updatedAt: Date.now(),
    };

    await ctx.env.LINKS.put(linkKey, JSON.stringify(updated));
    return json({ ok: true, code });
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
};

function setIfString<T extends object>(obj: T, key: keyof any, v: any) {
  if (typeof v === "string") {
    const t = v.trim();
    if (t !== "") (obj as any)[key] = t; // 只有非空字串才覆蓋；空字串代表「不變」
  }
}

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
