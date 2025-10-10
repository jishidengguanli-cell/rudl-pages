// functions/api/links/update.ts
// 請求：POST JSON
// { code, title?, version?, bundle_id?, lang?, force_reparse? }

import { readCookie, verifySession, Env as AuthEnv } from "../_lib/auth";

// 解析 IPA 用到的套件（支援 binary plist + 本地化 InfoPlist.strings）
import JSZip from "jszip";
import * as bplist from "bplist-parser";
import * as plist from "plist";

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

  // 新增：強制重新解析 IPA（即使 ipa_key 不變、只是覆蓋檔案）
  force_reparse?: boolean;
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
      ipaMeta?: { bundle_id?: string; version?: string; display_name?: string };
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

    // === 重新解析 IPA 並回寫 ipaMeta（如覆蓋同一路徑的新 IPA 或想補齊缺值）===
    try {
      const url = new URL(ctx.request.url);
      const force =
        Boolean(body.force_reparse) || url.searchParams.get("force_reparse") === "1";

      const metaIncomplete =
        !rec.ipaMeta ||
        !rec.ipaMeta.bundle_id ||
        !rec.ipaMeta.version ||
        !rec.ipaMeta.display_name;

      // 不允許在此 API 更改 ipa_key；以現有 rec.ipa_key 為準
      const ipaKey = rec.ipa_key || "";

      if (ipaKey && (force || metaIncomplete)) {
        const fresh = await ensureIpaMeta(ipaKey);
        if (fresh) {
          updated.ipaMeta = {
            bundle_id:    fresh.bundle_id    || updated.ipaMeta?.bundle_id    || "",
            version:      fresh.version      || updated.ipaMeta?.version      || "",
            display_name: fresh.display_name || updated.ipaMeta?.display_name || "",
          };
        }
      }
    } catch (_) {
      // 解析失敗不阻擋更新；如需可加 log
    }
    // === 重新解析 IPA end ===

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

/* ----------------------- IPA 解析工具 ----------------------- */
/* 支援：
   - Payload/<App>.app/Info.plist 解析（binary/XML）
   - 本地化 InfoPlist.strings（<Region>.lproj 與 Base.lproj；binary plist / UTF-16 / UTF-8）
   - 逐段 RFC3986 path 編碼避免 CDN 檔名含空白等字元
*/
async function ensureIpaMeta(ipaKey: string) {
  const url = "https://cdn.rudownload.win/" + encodePath(ipaKey.replace(/^\/+/, ""));
  const r = await fetch(url, { cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error("fetch ipa failed");
  const bytes = new Uint8Array(await r.arrayBuffer());
  return await extractIpaMeta(bytes);
}

function encodePath(path: string) {
  return path
    .split("/")
    .map((s) =>
      encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    )
    .join("/");
}

async function extractIpaMeta(ipaBytes: Uint8Array) {
  const zip = await JSZip.loadAsync(ipaBytes);
  const infoPath = Object.keys(zip.files).find((p) => /Payload\/[^/]+\.app\/Info\.plist$/.test(p));
  if (!infoPath) throw new Error("Info.plist not found");

  const infoBuf = await zip.file(infoPath)!.async("uint8array");
  const info: any = parsePlist(infoBuf);
  if (!info) throw new Error("Info.plist parse failed");

  const bundle_id = info.CFBundleIdentifier || "";
  const version = info.CFBundleShortVersionString || info.CFBundleVersion || "";

  // 顯示名稱：先取 plist；若為空或占位字，再讀本地化 strings
  let display_name = (info.CFBundleDisplayName || info.CFBundleName || "").trim();
  if (!display_name || /\$\(|%[@{]/.test(display_name)) {
    const devRegion = String(info.CFBundleDevelopmentRegion || "en");
    const appDir = infoPath.replace(/\/Info\.plist$/, "/");
    const candidates = [
      appDir + `${devRegion}.lproj/InfoPlist.strings`,
      appDir + `Base.lproj/InfoPlist.strings`,
    ];
    for (const p of candidates) {
      if (!zip.files[p]) continue;
      const buf = await zip.file(p)!.async("uint8array");
      const dict = parsePlistOrStrings(buf);
      const v = dict?.CFBundleDisplayName || dict?.CFBundleName;
      if (v && String(v).trim()) {
        display_name = String(v).trim();
        break;
      }
    }
  }

  return { bundle_id, version, display_name };
}

function parsePlist(buf: Uint8Array) {
  try {
    return bplist.parseBuffer(Buffer.from(buf))[0];
  } catch {}
  try {
    return plist.parse(Buffer.from(buf).toString("utf8"));
  } catch {}
  return null;
}

// .strings 可能是 binary plist，或 UTF-16/UTF-8 的 "k"="v";
function parsePlistOrStrings(buf: Uint8Array): any {
  const fromPlist = parsePlist(buf);
  if (fromPlist) return fromPlist;

  const u8 = Buffer.from(buf);
  let s = "";
  if (u8[0] === 0xff && u8[1] === 0xfe) s = new TextDecoder("utf-16le").decode(u8);
  else if (u8[0] === 0xfe && u8[1] === 0xff) s = new TextDecoder("utf-16be").decode(u8);
  else s = new TextDecoder("utf-8").decode(u8);

  const out: any = {};
  s.replace(/"([^"]+)"\s*=\s*"([^"]*)"\s*;/g, (_m, k, v) => {
    out[k] = v;
    return "";
  });
  return out;
}
