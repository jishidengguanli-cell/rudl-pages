// functions/api/links/create.ts
import { verifySession, type Env as AuthEnv } from "../_lib/auth";

type KV = KVNamespace;

interface Env extends AuthEnv {
  LINKS: KV;        // rudl-links
}

function json(status: number, data: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function pickStr(v: any, def = ""): string {
  return typeof v === "string" ? v : def;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // 1) 驗證登入
  const sess = await verifySession(env, request);
  if (!sess?.userId) return json(401, { error: "unauthorized" });
  const owner = String(sess.userId);

  // 2) 讀取 body
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "bad_json" });
  }

  // 3) 取用欄位（顯示用 + 檔案 key + ipaMeta + 語系）
  const title      = pickStr(body.title);
  const version    = pickStr(body.version);
  const bundleIdUi = pickStr(body.bundle_id);
  const lang       = pickStr(body.lang, "en");    // 預覽語系，預設 en

  const apkKey = pickStr(body.apkKey);
  const ipaKey = pickStr(body.ipaKey);
  const ipaMeta = (body?.ipaMeta && typeof body.ipaMeta === "object") ? body.ipaMeta : null as null | { bundle_id?: string; version?: string };

  // 4) 產生唯一短碼（固定以 link: 前綴寫入）
  const code = await allocCode(env.LINKS);
  const now = Date.now();

  // 5) 整理要寫入 KV 的紀錄
  const record: any = {
    id: code,
    code,
    owner,                // 用來過濾自己的清單
    title,
    version,
    bundle_id: bundleIdUi,
    lang,
    apk_key: apkKey,
    ipa_key: ipaKey,
    createdAt: now,
    updatedAt: now,
  };

  // 若 ipaMeta 有值但顯示欄位為空，補上顯示用資訊；不覆蓋使用者已輸入者
  if (ipaMeta) {
    if (!record.bundle_id && ipaMeta.bundle_id) record.bundle_id = String(ipaMeta.bundle_id);
    // 另外留一份 ios 欄位，僅供你之後想用
    record.ios = {
      bundle_id: pickStr(ipaMeta.bundle_id),
      version:   pickStr(ipaMeta.version),
    };
  }

  // 6) 寫入 KV（一定用 link:${code}）
  await env.LINKS.put(`link:${code}`, JSON.stringify(record));

  return json(200, { ok: true, code });
};

// 產生唯一短碼（4 碼 base62，不夠再延長）
async function allocCode(kv: KV): Promise<string> {
  const CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  async function tryLen(n: number): Promise<string> {
    for (let t = 0; t < 60; t++) {
      let s = "";
      // 用 crypto 取得較均勻亂數
      const buf = new Uint32Array(n);
      crypto.getRandomValues(buf);
      for (let i = 0; i < n; i++) s += CHARS[buf[i] % CHARS.length];
      const exists = await kv.get(`link:${s}`);
      if (!exists) return s;
    }
    return "";
  }
  let code = await tryLen(4);
  if (code) return code;
  code = await tryLen(5);
  if (code) return code;
  return await tryLen(6);
}
