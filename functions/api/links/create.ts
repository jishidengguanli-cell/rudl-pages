// functions/api/links/create.ts
import { readCookie, verifySession, Env as AuthEnv } from "../_lib/auth";
import JSZip from "jszip";
import * as bplist from "bplist-parser";
import * as plist from "plist";

export interface Env extends AuthEnv {
  LINKS: KVNamespace;
}

// 建立一個分發：產生短碼、寫入 LINKS、把短碼掛到使用者清單
// 輸入: { title?, version?, bundle_id?, apkKey?, ipaKey?, ipaMeta? }
// - apkKey / ipaKey：你的 R2 key，例如 "android/App-123.apk" / "ios/App-456.ipa"
// - ipaMeta：由前端解析 IPA 得到的 { bundle_id, version }，將供 /m/:code 產生 manifest 時優先使用
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const { LINKS, SESSION_SECRET } = ctx.env;

    // 1) 驗證登入
    const sid = readCookie(ctx.request, "sid");
    const me = sid ? await verifySession(SESSION_SECRET, sid) : null;
    if (!me) return j({ error: "unauthorized" }, 401);

    // 2) 解析輸入（顯示欄位可留空；檔案至少要有一個）
    const b = await ctx.request.json<any>().catch(() => ({}));
    const title = (b.title || "").toString().slice(0, 100);
    const version = (b.version || "").toString().slice(0, 50);       // 顯示用
    const bundle_id = (b.bundle_id || "").toString().slice(0, 200);  // 顯示用
    const apk_key = b.apkKey ? String(b.apkKey) : "";
    const ipa_key = b.ipaKey ? String(b.ipaKey) : "";

    // 解析來自前端的 ipaMeta（若有）
    const ipaMeta = b.ipaMeta && typeof b.ipaMeta === "object"
  ? {
      bundle_id: String(b.ipaMeta.bundle_id || ""),
      version: String(b.ipaMeta.version || ""),
      display_name: String(b.ipaMeta.display_name || "")
    }
  : null;

    if (!apk_key && !ipa_key) return j({ error: "apkKey or ipaKey required" }, 400);

    // 3) 產生唯一短碼（預設 4 碼，碰撞就再試）
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
      // 顯示用欄位（不影響 /m 的 manifest）
      title,
      version,
      bundle_id,
      // 實際檔案 key
      apk_key,
      ipa_key,
      // 自動偵測到的 IPA 真實資訊（/m 會優先使用）
      ipaMeta,
      createdAt: now,
      updatedAt: now
    };

    if (ipa_key) {
      const needFill =
        !ipaMeta ||
        !ipaMeta.bundle_id ||
        !ipaMeta.version ||
        !ipaMeta.display_name;

      if (needFill) {
        try {
          const meta = await ensureIpaMeta(ipa_key); // 下面附小工具
          if (meta) {
            (rec as any).ipaMeta = {
              bundle_id: meta.bundle_id || (ipaMeta?.bundle_id ?? ""),
              version: meta.version || (ipaMeta?.version ?? ""),
              display_name: meta.display_name || (ipaMeta?.display_name ?? ""),
            };
          }
        } catch (_) { /* 失敗不擋建立，讓 /d 端提示不完整 */ }
      }
    }

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
async function ensureIpaMeta(ipaKey: string) {
  // 你的 CDN 路徑寫法，依你現狀調整
  const url = "https://cdn.rudownload.win/" + encodePath(ipaKey.replace(/^\/+/, ""));
  const r = await fetch(url, { cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error("fetch ipa failed");
  const bytes = new Uint8Array(await r.arrayBuffer());
  return await extractIpaMeta(bytes);
}

function encodePath(path: string) {
  return path.split("/").map(s =>
    encodeURIComponent(s).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase())
  ).join("/");
}

async function extractIpaMeta(ipaBytes: Uint8Array) {
  const zip = await JSZip.loadAsync(ipaBytes);
  const infoPath = Object.keys(zip.files).find(p => /Payload\/[^/]+\.app\/Info\.plist$/.test(p));
  if (!infoPath) throw new Error("Info.plist not found");
  const infoBuf = await zip.file(infoPath)!.async("uint8array");
  const info: any = parsePlist(infoBuf);
  if (!info) throw new Error("Info.plist parse failed");

  const bundle_id = info.CFBundleIdentifier || "";
  const version = info.CFBundleShortVersionString || info.CFBundleVersion || "";

  // 顯示名稱：先取 plist；若空或疑似占位，再讀本地化 strings
  let display_name = (info.CFBundleDisplayName || info.CFBundleName || "").trim();
  if (!display_name || /\$\(|%[@{]/.test(display_name)) {
    const devRegion = String(info.CFBundleDevelopmentRegion || "en");
    const appDir = infoPath.replace(/\/Info\.plist$/, "/");
    const candidates = [
      appDir + `${devRegion}.lproj/InfoPlist.strings`,
      appDir + `Base.lproj/InfoPlist.strings`
    ];
    for (const p of candidates) {
      if (!zip.files[p]) continue;
      const buf = await zip.file(p)!.async("uint8array");
      const dict = parsePlistOrStrings(buf);
      const v = dict?.CFBundleDisplayName || dict?.CFBundleName;
      if (v && String(v).trim()) { display_name = String(v).trim(); break; }
    }
  }
  return { bundle_id, version, display_name };
}

function parsePlist(buf: Uint8Array) {
  try { return bplist.parseBuffer(Buffer.from(buf))[0]; } catch {}
  try { return plist.parse(Buffer.from(buf).toString("utf8")); } catch {}
  return null;
}

// .strings 可能是 binary plist、也可能是 UTF-16/UTF-8 的 key="value"; 檔
function parsePlistOrStrings(buf: Uint8Array): any {
  const fromPlist = parsePlist(buf);
  if (fromPlist) return fromPlist;
  // 嘗試當作字串表：偵測 UTF-16 BOM
  const u8 = Buffer.from(buf);
  let s = "";
  if (u8[0] === 0xFF && u8[1] === 0xFE) s = new TextDecoder("utf-16le").decode(u8);
  else if (u8[0] === 0xFE && u8[1] === 0xFF) s = new TextDecoder("utf-16be").decode(u8);
  else s = new TextDecoder("utf-8").decode(u8);
  const out: any = {};
  s.replace(/"([^"]+)"\s*=\s*"([^"]*)"\s*;/g, (_, k, v) => { out[k] = v; return ""; });
  return out;
}