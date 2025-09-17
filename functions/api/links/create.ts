// functions/api/links/create.ts
import { readCookie, verifySession, type Env as AuthEnv } from "../_lib/auth";

type Env = AuthEnv & {
  LINKS: KVNamespace;
};

function json(data: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

async function genCode(LINKS: KVNamespace) {
  // 4位碼，撞碼重試
  for (let i = 0; i < 8; i++) {
    const code = Math.random().toString(36).slice(2, 6);
    const exist = await LINKS.get(code);
    if (!exist) return code;
  }
  throw new Error("code collision");
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // 認證
  const sid = readCookie(request.headers.get("cookie") || "", "sid");
  const me = await verifySession(sid, env).catch(() => null);
  if (!me) return json({ error: "unauthorized" }, 401);

  // 讀 body
  let b: any = {};
  try { b = await request.json(); } catch {}
  const title     = String(b.title || "");
  const version   = String(b.version || "");
  const bundle_id = String(b.bundle_id || "");
  const apkKey    = String(b.apkKey || "");
  const ipaKey    = String(b.ipaKey || "");
  const ipaMeta   = (b.ipaMeta && typeof b.ipaMeta === "object") ? b.ipaMeta : null;
  const lang      = typeof b.lang === "string" && b.lang ? b.lang : "en"; // ← 接收/預設語系

  // 產 code
  const code = await genCode(env.LINKS);

  // 寫入 KV：顯示欄位以使用者填寫為主，沒填才用 ipaMeta 當備援
  const item = {
    id: code,
    code,
    owner: me.sub || me.id || me.email || "",

    title,
    version: version || (ipaMeta?.version || ""),
    bundle_id: bundle_id || (ipaMeta?.bundle_id || ""),

    apk_key: apkKey,
    ipa_key: ipaKey,

    lang, // ← 存預覽語系

    createdAt: Date.now(),
    updatedAt: Date.now(),

    // 初始統計
    stats: {
      today: 0, total: 0,
      apk_today: 0, apk_total: 0,
      ipa_today: 0, ipa_total: 0,
    }
  };

  await env.LINKS.put(code, JSON.stringify(item));
  return json({ ok: true, code });
};
