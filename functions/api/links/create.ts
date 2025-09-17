// functions/api/links/create.ts
import { readCookie, verifySession, type AuthEnv } from "../_lib/auth";

type Lang = "en" | "zh-TW" | "zh-CN" | "ru" | "vi";

export interface Env extends AuthEnv {
  LINKS: KVNamespace;      // rudl-links
}

// 小工具：標準 JSON 回應
function json(status: number, data: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// 產生 4 碼短碼，並確保 KV 中沒有同名的 link:<code>
async function genCode(linksKV: KVNamespace): Promise<string> {
  const abc = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  while (true) {
    let c = "";
    for (let i = 0; i < 4; i++) c += abc[(Math.random() * abc.length) | 0];
    const exists = await linksKV.get(`link:${c}`);
    if (!exists) return c;
  }
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const { request, env } = ctx;

    // ---- 防呆：Bindings 檢查 ----
    const linksKV: KVNamespace | undefined =
      (env as any).LINKS || (env as any).links;
    if (!linksKV || typeof (linksKV as any).get !== "function") {
      return json(500, { error: "config", detail: "KV binding LINKS missing" });
    }
    const usersKV: KVNamespace | undefined =
      (env as any).USERS || (env as any).users;
    if (!usersKV || typeof (usersKV as any).get !== "function") {
      return json(500, { error: "config", detail: "KV binding USERS missing" });
    }

    // ---- 驗證登入 ----
    const cookie = request.headers.get("cookie") || "";
    const sid = readCookie(cookie, "sid");
    const sess = await verifySession(env, sid).catch(() => null);
    if (!sess) return json(401, { error: "unauthorized" });

    // ---- 解析 body ----
    const body = await request.json().catch(() => null) as {
      title?: string;
      version?: string;         // 顯示用
      bundle_id?: string;       // 顯示用
      lang?: string;            // 預覽語系
      apkKey?: string;          // R2 key
      ipaKey?: string;          // R2 key
      ipaMeta?: { bundle_id?: string; version?: string };
    };
    if (!body) return json(400, { error: "bad_request" });

    // 語系：預設英文
    let lang: Lang = "en";
    const rawLang = (body.lang || "").trim();
    if (["en", "zh-TW", "zh-CN", "ru", "vi"].includes(rawLang)) {
      lang = rawLang as Lang;
    }

    // ---- 產生唯一短碼 ----
    const code = await genCode(linksKV);

    // ---- 組裝 link 物件（顯示欄位 + 檔案 key + 語系 + 統計欄位）----
    const link = {
      id: code,
      code,
      owner: sess.user.id,
      title: body.title?.trim() || "",
      version: body.version?.trim() || "",
      bundle_id: body.bundle_id?.trim() || "",
      lang,
      apk_key: body.apkKey || "",
      ipa_key: body.ipaKey || "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      today_apk: 0,
      today_ipa: 0,
      total_apk: 0,
      total_ipa: 0,
    };

    // 若前端有帶 IPA 解析結果、而顯示欄位為空，就用解析值補上
    if (body.ipaMeta) {
      if (!link.bundle_id && body.ipaMeta.bundle_id) link.bundle_id = body.ipaMeta.bundle_id;
      if (!link.version   && body.ipaMeta.version)   link.version   = body.ipaMeta.version;
    }

    // ---- 寫入主資料（一定要有 link: 前綴）----
    await linksKV.put(`link:${code}`, JSON.stringify(link));

    // ---- 更新使用者索引（列表會用到）----
    const idxKey = `user:${sess.user.id}`;
    const oldIdx = (await linksKV.get(idxKey)) || "";
    const nextIdx = oldIdx ? `${code} ${oldIdx}` : code;
    await linksKV.put(idxKey, nextIdx);

    return json(200, { ok: true, code, url: `/d/${code}`, lang });
  } catch (e: any) {
    // 統一回丟可讀的錯誤（避免「Internal」看不到原因）
    return json(500, {
      error: "internal",
      detail: e?.message || String(e),
    });
  }
};
