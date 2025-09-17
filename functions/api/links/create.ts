// functions/api/links/create.ts
export interface Env {
  LINKS: KVNamespace;
}

type CreateBody = {
  title?: string;
  version?: string;
  bundle_id?: string;
  lang?: string;       // 預設語系
  apkKey?: string;
  ipaKey?: string;
  ipaMeta?: { bundle_id?: string; version?: string } | null;
};

const ALLOWED_LANGS = ["en", "zh-TW", "zh-CN", "ru", "vi"];

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function randCode(len = 4) {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function genUniqueCode(kv: KVNamespace): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const c = randCode(4);
    const hit = await kv.get(c);
    if (!hit) return c;
  }
  // 極小機率撞碼很多次就拉長
  for (let i = 0; i < 8; i++) {
    const c = randCode(5);
    const hit = await kv.get(c);
    if (!hit) return c;
  }
  throw new Error("failed to generate unique short code");
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (!env.LINKS) {
      // 綁定不存在也會造成 .get is not a function / undefined.get
      throw new Error("KV binding LINKS is missing");
    }

    // 兼容 JSON 與 form-data
    const ct = request.headers.get("content-type") || "";
    let body: CreateBody = {};

    if (ct.includes("application/json")) {
      const raw = await request.json().catch(() => ({}));
      body = (raw || {}) as CreateBody;
    } else if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      body = {
        title: form.get("title")?.toString() || "",
        version: form.get("version")?.toString() || "",
        bundle_id: form.get("bundle_id")?.toString() || "",
        lang: form.get("lang")?.toString() || undefined,
        apkKey: form.get("apkKey")?.toString() || "",
        ipaKey: form.get("ipaKey")?.toString() || "",
        // 如果前端用 form，ipaMeta 可不傳；解析放前端做了
      };
    } else {
      // 其他 content-type，一律當 JSON 嘗試
      const raw = await request.json().catch(() => ({}));
      body = (raw || {}) as CreateBody;
    }

    // 取出欄位 + 預設值
    let {
      title = "",
      version = "",
      bundle_id = "",
      lang = "en",
      apkKey = "",
      ipaKey = "",
      ipaMeta = null
    } = body;

    // 語系白名單
    if (!ALLOWED_LANGS.includes(lang)) lang = "en";

    // 下載頁顯示欄位：若有 ipaMeta 就覆寫顯示
    const displayBundle = (ipaMeta?.bundle_id || bundle_id || "").trim();
    const displayVersion = (ipaMeta?.version || version || "").trim();

    if (!apkKey && !ipaKey) {
      return json({ error: "bad_request", detail: "apkKey 或 ipaKey 至少要有一個" }, 400);
    }

    // 產生唯一短碼
    const code = await genUniqueCode(env.LINKS);
    const now = Date.now();

    // 寫 KV（你原本 list 用到的欄位可照舊保留/擴充）
    const rec = {
      id: code,
      code,
      title: title.trim(),
      version: displayVersion,
      bundle_id: displayBundle,
      lang,                // <-- 下載頁預設語系
      apk_key: apkKey || null,
      ipa_key: ipaKey || null,
      createdAt: now,
      updatedAt: now,
      // 初始統計
      d_today_apk: 0,
      d_today_ios: 0,
      d_total_apk: 0,
      d_total_ios: 0
    };

    await env.LINKS.put(code, JSON.stringify(rec));

    return json({ ok: true, code });
  } catch (e: any) {
    // 把錯誤寫到日誌，方便在 Cloudflare Pages → Deployments → View details → Functions logs 看到
    console.error("links/create error:", e);
    return json({ error: "internal", detail: e?.message || String(e) }, 500);
  }
};
