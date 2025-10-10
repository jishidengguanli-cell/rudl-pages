// functions/d/[code].ts
export interface Env { LINKS: KVNamespace; }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const code = String(ctx.params?.code || "");
  if (!code) return resp404("Invalid code");

  const raw = await ctx.env.LINKS.get(`link:${code}`);
  if (!raw) return resp404("Not Found");

  type Meta = {
    bundle_id?: string;
    version?: string;
    display_name?: string;
    name?: string;
    CFBundleDisplayName?: string;
    CFBundleName?: string;
    dev_name?: string; // 企業開發者名稱，僅顯示用
  };
  type Rec = {
    code: string;
    title?: string;      // 後備
    version?: string;    // 後備
    bundle_id?: string;  // 後備
    lang?: string;
    apk_key?: string;
    ipa_key?: string;
    ipaMeta?: Meta;
  };

  let rec: Rec;
  try { rec = JSON.parse(raw); } catch { return resp404("Broken record"); }

  const hasApk = !!rec.apk_key;
  const hasIpa = !!rec.ipa_key;

  // 取 IPA 內資訊為主
  const meta = rec.ipaMeta || {};
  const title   = meta.display_name || meta.name || meta.CFBundleDisplayName || meta.CFBundleName || rec.title || "App";
  const verDisp = meta.version || rec.version || "";
  const bidDisp = meta.bundle_id || rec.bundle_id || "";
  const devName = meta.dev_name || "企業開發者";

  // ---- i18n（略，與你現版相同）----
  const url = new URL(ctx.request.url);
  const qlang = normLang(url.searchParams.get("lang"));
  const baseLang = normLang(rec.lang || "");
  const reqLang  = pickBestLang(qlang || baseLang, ctx.request.headers.get("accept-language"));
  const t = (k: string) => (LOCALES[reqLang]?.[k] || LOCALES["zh-TW"][k] || k);
  const switcher = renderLangSwitcher(rec.code, reqLang);

  // 連結
  const hrefApk = hasApk ? `/dl/${encodeURIComponent(rec.code)}?p=apk` : "";
  const manifest = `${url.origin}/m/${encodeURIComponent(rec.code)}`;
  const hrefIos  = hasIpa ? `itms-services://?action=download-manifest&url=${encodeURIComponent(manifest)}` : "";

  // …（下方整個 HTML 與腳本維持你現版的結構，只把顯示的三個欄位換成上面的 title/verDisp/bidDisp）
  // 這裡略去版面，若要我幫你把完整版再貼一次也可以。
  // 重要的是：頁面顯示與 plist 一樣，統一優先使用 ipaMeta。
  const html = `<!doctype html>
<html lang="${attr(htmlLang(reqLang))}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${h(title)} - ${h(t("download"))}</title>
  <!-- 省略樣式，保持原版 -->
</head>
<body>
  <!-- 省略 header -->
  <main class="wrap">
    <section class="card">
      <div class="meta">
        <div class="muted">${h(t("version"))}</div><div>${h(verDisp || "-")}</div>
        <div class="muted">Bundle ID</div><div>${h(bidDisp || "-")}</div>
        <div class="muted">${h(t("platform"))}</div>
        <div>
          ${hasApk ? `<span>${h(t("androidApk"))}</span>` : `<span class="muted">${h(t("androidNone"))}</span>`}
          &nbsp;·&nbsp;
          ${hasIpa ? `<span>${h(t("iosIpa"))}</span>` : `<span class="muted">${h(t("iosNone"))}</span>`}
        </div>
      </div>

      <div class="btns">
        ${hasApk ? `<a class="btn" href="${attr(hrefApk)}" id="btn-android">${h(t("androidDownload"))}</a>` : ""}
        ${hasIpa ? `<a class="btn" href="${attr(hrefIos)}" id="btn-ios" data-dev="${attr(devName)}">${h(t("iosInstall"))}</a>` : ""}
        ${!hasApk && !hasIpa ? `<span class="muted">${h(t("noFiles"))}</span>` : ""}
      </div>

      <div class="tip">${h(t("tip"))}</div>
    </section>
    <div class="footer">© ${new Date().getFullYear()} RU Download</div>
  </main>
  <!-- 省略 iOS 引導與腳本，內容不變 -->
</body>
</html>`;

  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }});
};

/* ---- i18n 與 helpers 保持你現有版本 ---- */
function normLang(v?: string | null){ /* ... */ }
function pickBestLang(primary: string, accept: string | null){ /* ... */ }
function htmlLang(l:string){ /* ... */ }
const LOCALES: Record<string, Record<string,string>> = { /* ... */ };
function renderLangSwitcher(code: string, cur: string){ /* ... */ }
function resp404(msg: string){ /* ... */ }
function h(s: any){ /* ... */ }
function attr(s: any){ /* ... */ }
