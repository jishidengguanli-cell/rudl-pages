// functions/api/links/create.ts
import { readCookie, verifySession, type AuthEnv } from "../../_lib/auth";

type Lang = "zh-TW" | "zh-CN" | "en" | "ru" | "vi";

export interface Env extends AuthEnv {
  LINKS: KVNamespace; // 你綁定的 rudl-links
}

// 產生 4 碼大小寫英文字，並確認在 KV 不重複（用 link: 作為唯一檢查）
async function genCode(links: KVNamespace): Promise<string> {
  const abc = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  while (true) {
    let c = "";
    for (let i = 0; i < 4; i++) c += abc[Math.floor(Math.random() * abc.length)];
    const exists = await links.get(`link:${c}`);
    if (!exists) return c;
  }
}

function json(status: number, data: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const { request, env } = ctx;

    // 1) 驗證登入
    const cookie = request.headers.get("cookie") || "";
    const sid = readCookie(cookie, "sid");
    const sess = await verifySession(env, sid);
    if (!sess) return json(401, { error: "unauthorized" });

    // 2) 解析 body
    const body = await request
      .json()
      .catch(() => null) as {
        title?: string;
        version?: string;
        bundle_id?: string;
        lang?: string;
        apkKey?: string;
        ipaKey?: string;
        ipaMeta?: { bundle_id?: string; version?: string };
      };

    if (!body) return json(400, { error: "bad_request" });

    // 語系處理（預設英文）
    let lang: Lang = "en";
    const raw = (body.lang || "").trim();
    if (["zh-TW", "zh-CN", "en", "ru", "vi"].includes(raw)) {
      lang = raw as Lang;
    }

    // 3) 產生唯一短碼
    const code = await genCode(env.LINKS);

    // 4) 整理要存的 link 物件
    const link = {
      id: code,
      code,
      owner: sess.user.id,
      title: body.title || "",
      version: body.version || "",
      bundle_id: body.bundle_id || "",
      lang,                 // 下載頁預設語系
      apk_key: body.apkKey || "",
      ipa_key: body.ipaKey || "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      today_apk: 0,
      today_ipa: 0,
      total_apk: 0,
      total_ipa: 0,
    };

    // 若前端有帶到從 IPA 解析的 meta，且顯示欄位沒填，就用解析值補上
    if (body.ipaMeta) {
      if (!link.bundle_id && body.ipaMeta.bundle_id) link.bundle_id = body.ipaMeta.bundle_id;
      if (!link.version   && body.ipaMeta.version)   link.version   = body.ipaMeta.version;
    }

    // 5) 寫入主資料（一定要含 prefix：link:）
    await env.LINKS.put(`link:${code}`, JSON.stringify(link));

    // 6) 更新使用者索引（讓 list 能快速撈）
    const idxKey = `user:${sess.user.id}`;
    const oldIdx = (await env.LINKS.get(idxKey)) || "";
    const nextIdx = oldIdx ? `${code} ${oldIdx}` : code;
    await env.LINKS.put(idxKey, nextIdx);

    return json(200, { ok: true, code, url: `/d/${code}`, lang });
  } catch (e: any) {
    return json(500, { error: "internal", detail: e?.message || String(e) });
  }
};
