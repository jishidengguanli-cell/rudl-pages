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

// ---- i18n ----
const LOCALES: Record<string, Record<string,string>> = {
  "zh-TW": {
    download:"下載", version:"版本", platform:"平台",
    androidApk:"Android APK", androidNone:"Android（無）", iosIpa:"iOS IPA", iosNone:"iOS（無）",
    androidDownload:"Android 下載", iosInstall:"iOS 安裝", noFiles:"尚未上傳可下載的檔案。",
    tip:"提示：iOS 第一次安裝企業 App 需前往「設定」→「一般」→「VPN 與裝置管理 / 描述檔與裝置管理」信任開發者。",
    iosGuideTitle:"下一步：啟用企業 App", iosGuideDetecting:"正在判斷 iOS 版本…",
    step1:"安裝完成後，先不要直接開啟 App。", step2:"打開「設定」→「一般」→「VPN 與裝置管理 / 描述檔與裝置管理」。",
    step3a:"點選「開發者 App」中的", step3b:"→ 信任 → 驗證。", step4:"回到桌面再開啟 App。",
    copyDev:"複製開發者名稱", tryOpenApp:"嘗試開啟 App", close:"關閉", trustOnce:"＊信任僅需一次，之後更新無須重複。",
    enterpriseDev:"企業開發者",
    path16:"設定 → 一般 → VPN 與裝置管理 → 開發者 App → 信任",
    path14:"設定 → 一般 → 描述檔與裝置管理 → 開發者 App → 信任",
    pathOld:"設定 → 一般 → 裝置管理 / 描述檔 → 開發者 App → 信任",
    detected:"偵測到 iOS",
    language:"語言"
  },
  "en": {
    download:"Download", version:"Version", platform:"Platform",
    androidApk:"Android APK", androidNone:"Android (none)", iosIpa:"iOS IPA", iosNone:"iOS (none)",
    androidDownload:"Download for Android", iosInstall:"Install on iOS", noFiles:"No downloadable files uploaded yet.",
    tip:"Tip: For the first enterprise app install, go to Settings → General → VPN & Device Management / Profiles & Device Management to trust the developer.",
    iosGuideTitle:"Next step: Enable the enterprise app", iosGuideDetecting:"Detecting iOS version…",
    step1:"After installation, do not open the app immediately.", step2:"Open Settings → General → VPN & Device Management / Profiles & Device Management.",
    step3a:"Under “Developer App”, select", step3b:"→ Trust → Verify.", step4:"Return to Home and open the app.",
    copyDev:"Copy developer name", tryOpenApp:"Try opening app", close:"Close", trustOnce:"*You only need to trust once for this developer.",
    enterpriseDev:"Enterprise Developer",
    path16:"Settings → General → VPN & Device Management → Developer App → Trust",
    path14:"Settings → General → Profiles & Device Management → Developer App → Trust",
    pathOld:"Settings → General → Device Management / Profiles → Developer App → Trust",
    detected:"Detected iOS",
    language:"Language"
  },
  "zh-CN": {
    download:"下载", version:"版本", platform:"平台",
    androidApk:"Android APK", androidNone:"Android（无）", iosIpa:"iOS IPA", iosNone:"iOS（无）",
    androidDownload:"Android 下载", iosInstall:"iOS 安装", noFiles:"尚未上传可下载的文件。",
    tip:"提示：第一次安装企业 App 需前往「设置」→「通用」→「VPN 与设备管理 / 描述文件与设备管理」信任开发者。",
    iosGuideTitle:"下一步：启用企业 App", iosGuideDetecting:"正在判断 iOS 版本…",
    step1:"安装完成后，先不要直接打开 App。", step2:"打开「设置」→「通用」→「VPN 与设备管理 / 描述文件与设备管理」。",
    step3a:"点击「开发者 App」中的", step3b:"→ 信任 → 验证。", step4:"回到桌面再打开 App。",
    copyDev:"复制开发者名称", tryOpenApp:"尝试打开 App", close:"关闭", trustOnce:"＊信任仅需一次，之后更新无需重复。",
    enterpriseDev:"企业开发者",
    path16:"设置 → 通用 → VPN 与设备管理 → 开发者 App → 信任",
    path14:"设置 → 通用 → 描述文件与设备管理 → 开发者 App → 信任",
    pathOld:"设置 → 通用 → 设备管理 / 描述文件 → 开发者 App → 信任",
    detected:"检测到 iOS",
    language:"语言"
  },
  "ru": {
    download:"Загрузка", version:"Версия", platform:"Платформа",
    androidApk:"Android APK", androidNone:"Android (нет)", iosIpa:"iOS IPA", iosNone:"iOS (нет)",
    androidDownload:"Скачать для Android", iosInstall:"Установить на iOS", noFiles:"Файлы для загрузки пока не загружены.",
    tip:"Подсказка: при первой установке корпоративного приложения перейдите в «Настройки» → «Основные» → «VPN и управление устройством / Профили и управление устройством» и доверяйте разработчику.",
    iosGuideTitle:"Следующий шаг: доверить корпоративное приложение", iosGuideDetecting:"Определение версии iOS…",
    step1:"После установки не открывайте приложение сразу.", step2:"Откройте «Настройки» → «Основные» → «VPN и управление устройством / Профили и управление устройством».",
    step3a:"В разделе «Developer App» выберите", step3b:"→ Доверять → Проверить.", step4:"Вернитесь на главный экран и откройте приложение.",
    copyDev:"Скопировать имя разработчика", tryOpenApp:"Попробовать открыть приложение", close:"Закрыть", trustOnce:"*Доверие выполняется один раз для данного разработчика.",
    enterpriseDev:"Корпоративный разработчик",
    path16:"Настройки → Основные → VPN и управление устройством → Developer App → Доверять",
    path14:"Настройки → Основные → Профили и управление устройством → Developer App → Доверять",
    pathOld:"Настройки → Основные → Управление устройством / Профили → Developer App → Доверять",
    detected:"Обнаружена iOS",
    language:"язык"
  },
  "vi": {
    download:"Tải xuống", version:"Phiên bản", platform:"Nền tảng",
    androidApk:"Android APK", androidNone:"Android (không có)", iosIpa:"iOS IPA", iosNone:"iOS (không có)",
    androidDownload:"Tải cho Android", iosInstall:"Cài đặt trên iOS", noFiles:"Chưa có tệp nào để tải xuống.",
    tip:"Mẹo: Lần đầu cài app doanh nghiệp, vào Cài đặt → Cài đặt chung → VPN & Quản lý thiết bị / Hồ sơ & Quản lý thiết bị để tin cậy nhà phát triển.",
    iosGuideTitle:"Bước tiếp theo: bật ứng dụng doanh nghiệp", iosGuideDetecting:"Đang xác định phiên bản iOS…",
    step1:"Sau khi cài đặt, chưa mở ứng dụng ngay.", step2:"Mở Cài đặt → Cài đặt chung → VPN & Quản lý thiết bị / Hồ sơ & Quản lý thiết bị.",
    step3a:"Trong “Developer App”, chọn", step3b:"→ Tin cậy → Xác minh.", step4:"Quay lại màn hình chính rồi mở ứng dụng.",
    copyDev:"Sao chép tên nhà phát triển", tryOpenApp:"Thử mở ứng dụng", close:"Đóng", trustOnce:"*Chỉ cần tin cậy một lần cho nhà phát triển này.",
    enterpriseDev:"Nhà phát triển doanh nghiệp",
    path16:"Cài đặt → Cài đặt chung → VPN & Quản lý thiết bị → Developer App → Tin cậy",
    path14:"Cài đặt → Cài đặt chung → Hồ sơ & Quản lý thiết bị → Developer App → Tin cậy",
    pathOld:"Cài đặt → Cài đặt chung → Quản lý thiết bị / Hồ sơ → Developer App → Tin cậy",
    detected:"Đã phát hiện iOS",
    language:"ngôn ngữ"
  },
};


// ===== 其餘 helpers（原樣保留） =====
function renderLangSwitcher(code: string, cur: string) {
  const opts = [
    { v: "en",    label: "English" },
    { v: "ru",    label: "Русский" },
    { v: "vi",    label: "Tiếng Việt" },
    { v: "zh-TW", label: "繁中" },
    { v: "zh-CN", label: "简体" },
  ];

  // 這裡不要呼叫 t()（作用域拿不到），直接用 LOCALES 取對應語系的翻譯
  const langLabel =
    (LOCALES as any)?.[cur]?.language ||
    (LOCALES as any)?.["zh-TW"]?.language ||
    "Language";

  const options = opts
    .map(
      (o) =>
        `<option value="${h(o.v)}"${
          o.v === cur ? " selected" : ""
        }>${h(o.label)}</option>`
    )
    .join("");

  return `
  <label style="display:inline-flex;align-items:center;gap:.5rem">
    <span style="opacity:.75">${h(langLabel)}</span>
    <select id="langSel"
            style="padding:.4rem .6rem;border-radius:10px;background:#0b1222;border:1px solid #334155;color:#e5e7eb">
      ${options}
    </select>
  </label>
  <script>
    (function(){
      var sel = document.getElementById('langSel');
      if(!sel) return;
      sel.addEventListener('change', function(){
        var url = new URL(location.href);
        url.searchParams.set('lang', this.value);
        location.href = url.toString();
      });
    })();
  </script>`;
}


function normLang(v?: string | null) {
  if (!v) return "";
  const s = v.trim();
  if (s === "zh" || s === "zh-hant") return "zh-TW";
  if (s === "zh-hans") return "zh-CN";
  if (s === "en-US" || s === "en-GB") return "en";
  return ["zh-TW","en","zh-CN","ru","vi"].includes(s) ? s : "";
}

function pickBestLang(primary: string, accept: string | null) {
  if (primary) return primary;
  const a = (accept||"").toLowerCase();
  if (/zh\-tw|zh\-hant/.test(a)) return "zh-TW";
  if (/zh|hans|cn/.test(a)) return "zh-CN";
  if (/ru/.test(a)) return "ru";
  if (/vi/.test(a)) return "vi";
  if (/en/.test(a)) return "en";
  return "zh-TW";
}
function htmlLang(l:string){ return l==="zh-CN"?"zh-Hans":(l==="zh-TW"?"zh-Hant":l); }

// ---- helpers ----
function resp404(msg: string) {
  return new Response(msg || "Not Found", { status: 404, headers: { "cache-control": "no-store" }});
}
function h(s: any) {
  return String(s ?? "").replace(/[&<>"']/g, (m) =>
    m === "&" ? "&amp;" : m === "<" ? "&lt;" : m === ">" ? "&gt;" : m === '"' ? "&quot;" : "&#39;"
  );
}
function attr(s: any) { return h(s).replace(/"/g, "&quot;"); }
