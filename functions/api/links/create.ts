// functions/api/links/create.ts
import { readCookie, verifySession, type Env as AuthEnv } from "../_lib/auth";

type Env = AuthEnv & { LINKS: KVNamespace };

const J = (d: any, s = 200) =>
  new Response(JSON.stringify(d), {
    status: s,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function normLang(v: unknown) {
  const x = String(v || "").trim();
  if (["en", "zh-TW", "zh-CN", "ru", "vi"].includes(x)) return x;
  const k = x.toLowerCase();
  if (k === "zh-tw") return "zh-TW";
  if (k === "zh-cn") return "zh-CN";
  return "en";
}

async function genCode(LINKS: KVNamespace) {
  for (let i = 0; i < 8; i++) {
    const code = Math.random().toString(36).slice(2, 6);
    if (!(await LINKS.get(code))) return code;
  }
  throw new Error("code collision");
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const { request, env } = ctx;

  // 僅允許 POST
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "allow": "POST", "content-type": "text/plain; charset=utf-8" },
    });
  }

  try {
    // 驗證
    const sid = readCookie(request.headers.get("cookie") || "", "sid");
    const me = await verifySession(sid, env).catch(() => null);
    if (!me) return J({ error: "unauthorized" }, 401);

    // 讀 body
    let b: any = {};
    try {
      b = await request.json();
    } catch {
      return J({ error: "bad_request", detail: "invalid json body" }, 400);
    }

    const title     = String(b.title || "");
    const version   = String(b.version || "");
    const bundle_id = String(b.bundle_id || "");
    const apkKey    = String(b.apkKey || "");
    const ipaKey    = String(b.ipaKey || "");
    const ipaMeta   = (b.ipaMeta && typeof b.ipaMeta === "object") ? b.ipaMeta : null;
    const lang      = normLang(b.lang);

    const code = await genCode(env.LINKS);

    const rec = {
      id: code,
      code,
      owner: me.sub || me.id || me.email || "",
      title,
      version: version || ipaMeta?.version || "",
      bundle_id: bundle_id || ipaMeta?.bundle_id || "",
      apk_key:  apkKey || null,
      ipa_key:  ipaKey || null,
      lang,                                   // 預覽語系
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stats: { today: 0, total: 0, apk_today: 0, apk_total: 0, ipa_today: 0, ipa_total: 0 },
    };

    await env.LINKS.put(code, JSON.stringify(rec));
    return J({ ok: true, code });
  } catch (e: any) {
    // 把錯誤印出來，並回 JSON，避免前端拿到 HTML
    console.error("create link failed:", e?.stack || e);
    return J({ error: "internal", detail: String(e?.message || e) }, 500);
  }
};
