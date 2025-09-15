// functions/api/links/create.ts
import { readCookie, verifySession, Env as AuthEnv } from "../_lib/auth";

export interface Env extends AuthEnv {
  LINKS: KVNamespace;
}

// 建立一個分發：產生短碼、寫入 LINKS、把短碼掛到使用者清單
// 輸入: { title?, version?, bundle_id?, apkKey?, ipaKey?, ipaMeta? }
// - 顯示用：title/version/bundle_id
// - 安裝用：ipaMeta.bundle_id / ipaMeta.version（由前端自動解析）
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const { LINKS, SESSION_SECRET } = ctx.env;

    // 1) 驗證登入
    const sid = readCookie(ctx.request, "sid");
    const me = sid ? await verifySession(SESSION_SECRET, sid) : null;
    if (!me) return j({ error: "unauthorized" }, 401);

    // 2) 解析輸入
    const b = await ctx.request.json<any>().catch(() => ({}));
    const title = (b.title || "").toString().slice(0, 100);
    const version = (b.version || "").toString().slice(0, 50);       // 顯示用
    const bundle_id = (b.bundle_id || "").toString().slice(0, 200);  // 顯示用
    const apk_key = b.apkKey ? String(b.apkKey) : "";
    const ipa_key = b.ipaKey ? String(b.ipaKey) : "";

    // 自動偵測（可選）
    const ipaMeta = b.ipaMeta && typeof b.ipaMeta === "object" ? {
      bundle_id: String(b.ipaMeta.bundle_id || ""),
      version:   String(b.ipaMeta.version   || "")
    } : null;

    if (!apk_key && !ipa_key) return j({ error: "apkKey or ipaKey required" }, 400);

    // 3) 產生唯一短碼（預設 4 碼，避免碰撞重試）
    let code = "";
    for (let i = 0; i < 8; i++) {
      const c = code4();
      const exists = await LINKS.get(`link:${c}`);
      if (!exists) { code = c; break; }
    }
    if (!code) return j({ error: "retry code generation" }, 500);

    const now = Date.now();
    const rec = {
      id: code,
      code,
      owner: me.uid,
      title,      // 顯示用
      version,    // 顯示用
      bundle_id,  // 顯示用
      apk_key,
      ipa_key,
      ipaMeta,    // ★ 安裝用（/m 會優先取此處）
      createdAt: now,
      updatedAt: now
    };

    // 4) 寫入主資料
    await LINKS.put(`link:${code}`, JSON.stringify(rec));

    // 5) 把短碼掛到使用者清單（每行一個 code）
    const listKey = `user:${me.uid}:codes`;
    const existing = (await LINKS.get(listKey)) || "";
    const set = new Set(existing.split("\n").filter(Boolean));
    set.add(code);
    await LINKS.put(listKey, Array.from(set).join("\n"));

    // 6) 回傳
    return new Response(JSON.stringify({ code, url: `/d/${code}` }), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  } catch (e: any) {
    return j({ error: "internal", detail: String(e?.message || e) }, 500);
  }
};

function j(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
function code4() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
