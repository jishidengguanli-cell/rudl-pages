// functions/d/[code].ts
// 下載頁：多語系（zh-TW / en / zh-CN / ru / vi）+ 語言切換器 + iOS 引導面板
export interface Env { LINKS: KVNamespace; }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const code = String(ctx.params?.code || "");
  if (!code) return resp404("Invalid code");

  const raw = await ctx.env.LINKS.get(`link:${code}`);
  if (!raw) return resp404("Not Found");

  type Rec = {
    code: string;
    title?: string;
    version?: string;    // 顯示用（會員填）
    bundle_id?: string;  // 顯示用（會員填）
    lang?: string;       // 預設語系（會員選）
    apk_key?: string;
    ipa_key?: string;
    ipaMeta?: { dev_name?: string }; // 僅用於說明面板
    createdAt?: number;
  };

  let rec: Rec;
  try { rec = JSON.parse(raw); } catch { return resp404("Broken record"); }

  const hasApk = !!rec.apk_key;
  const hasIpa = !!rec.ipa_key;

  // ---- i18n ----
  const url = new URL(ctx.request.url);
  const qlang = normLang(url.searchParams.get("lang"));
  const baseLang = normLang(rec.lang || "");
  const reqLang  = pickBestLang(qlang || baseLang, ctx.request.headers.get("accept-language"));
  const t = (k: string) => (LOCALES[reqLang][k] || LOCALES["zh-TW"][k] || k);

  const title   = rec.title || "App";
  const verDisp = rec.version ?? "";
  const bidDisp = rec.bundle_id ?? "";
  const devName = rec.ipaMeta?.dev_name || t("enterpriseDev"); // 面板顯示

  const switcher = renderLangSwitcher(code, reqLang);

  // 下載按鈕：
  //  - Android：仍走 /dl 以統計，點擊前先 /api/dl/bill 檢查
  //  - iOS：直接 itms-services（不再透過 /dl 302）；扣點改背景送出，避免阻塞與失去使用者手勢
  const hrefApk = `/dl/${encodeURIComponent(rec.code)}?p=apk`;
  // 直接把 manifest 直鏈組好，避免 302 → itms-services 被擋
  const manifest = `${url.origin}/m/${encodeURIComponent(code)}`;
  const hrefIos  = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifest)}`;

  const html = `<!doctype html>
<html lang="${attr(htmlLang(reqLang))}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${h(title)} - ${h(t("download"))}</title>
  <meta name="robots" content="noindex,nofollow"/>
  <style>
    body{margin:0;background:#0f172a;color:#e5e7eb;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
    header{background:#0b1222;border-bottom:1px solid #1f2937}
    .wrap{max-width:880px;margin:0 auto;padding:16px}
    a{color:#93c5fd;text-decoration:none}
    .card{background:#111827;border:1px solid #1f2937;border-radius:16px;padding:22px;margin-top:22px}
    .muted{color:#9ca3af}
    .row{display:flex;gap:14px;flex-wrap:wrap}
    .btn{padding:12px 16px;border-radius:12px;border:0;background:#3b82f6;color:#fff;cursor:pointer}
    .btn.secondary{background:#334155}
    .meta{display:grid;grid-template-columns:140px 1fr;gap:6px 10px;margin-top:8px}
    code,kbd{background:#0b1222;border:1px solid #334155;border-radius:8px;padding:2px 6px}
    .hero{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .hero h1{margin:0;font-size:22px}
    .btns{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
    .tip{margin-top:10px;font-size:14px;color:#9ca3af}
    .footer{color:#9ca3af;text-align:center;margin:18px 0}
    .lang{display:flex;align-items:center;gap:8px}
    .lang a{padding:6px 10px;border-radius:10px;border:1px solid #1f2937;background:#0b1222;color:#cbd5e1}
    .lang a.active{background:#3b82f6;color:#fff;border-color:#3b82f6}

    /* iOS 引導樣式 */
    .guide-mask{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;z-index:9999}
    .guide{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
      width:min(540px,92vw);background:#0b1220;color:#e5e7eb;border:1px solid #1f2937;border-radius:14px;
      box-shadow:0 10px 30px rgba(0,0,0,.4);padding:18px;z-index:10000}
    .guide h3{margin:0 0 8px}
    .guide .muted{color:#9ca3af}
    .guide .steps{margin:10px 0 0 18px}
    .guide .row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
    .guide .btn{padding:10px 12px;border-radius:10px;border:0;background:#3b82f6;color:#fff;cursor:pointer}
    .guide .btn.ghost{background:#192235;color:#cbd5e1}
    .guide .btn.red{background:#ef4444}
    .guide .footer{display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px}
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <nav class="hero">
        <h1>${h(title)}</h1>
        <div class="lang">${switcher}</div>
      </nav>
    </div>
  </header>

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

  <!-- iOS 安裝後引導 -->
  <div class="guide-mask" id="iosGuideMask"></div>
  <div class="guide" id="iosGuide" style="display:none" role="dialog" aria-modal="true" aria-labelledby="iosGuideTitle">
    <h3 id="iosGuideTitle">${h(t("iosGuideTitle"))}</h3>
    <div class="muted" id="iosPath">${h(t("iosGuideDetecting"))}</div>
    <ol class="steps" id="iosSteps">
      <li>${h(t("step1"))}</li>
      <li>${h(t("step2"))}</li>
      <li>${h(t("step3a"))} <b><span id="devName">${h(devName)}</span></b> ${h(t("step3b"))}</li>
      <li>${h(t("step4"))}</li>
    </ol>

    <div class="row">
      <button class="btn ghost" id="btnCopyDev" type="button">${h(t("copyDev"))}</button>
      <button class="btn" id="btnOpenApp" type="button" data-scheme="">${h(t("tryOpenApp"))}</button>
      <button class="btn red" id="btnCloseGuide" type="button">${h(t("close"))}</button>
    </div>
    <div class="footer">
      <span class="muted">${h(t("trustOnce"))}</span>
    </div>
  </div>

  <script>
  (function(){
    var installBtn = document.getElementById('btn-ios');
    var code = (location.pathname.split('/').pop() || '').trim();

    // iOS 引導
    if (installBtn) {
      var devName = installBtn.getAttribute('data-dev') || (window.__DEV_NAME__ || '${h(devName)}');
      var devEl = document.getElementById('devName'); if (devEl) devEl.textContent = devName;

      var schemeFromGlobal = (window.__APP_SCHEME__ || '');
      var openBtn = document.getElementById('btnOpenApp');
      if (schemeFromGlobal) openBtn.setAttribute('data-scheme', schemeFromGlobal);
      if (!openBtn.getAttribute('data-scheme')) openBtn.style.display = 'none';

      var mask  = document.getElementById('iosGuideMask');
      var guide = document.getElementById('iosGuide');

      function isiOS(){ return /iP(hone|od|ad)/.test(navigator.userAgent); }
      function isSafari(){
        var ua = navigator.userAgent;
        return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
      }
      function iOSMajor(){ var m = navigator.userAgent.match(/OS (\\d+)_/i); return m ? parseInt(m[1],10) : null; }
      function setPath(){
        var v = iOSMajor() || 17;
        var path;
        if (v >= 16) path = '${h(t("path16"))}';
        else if (v >= 14) path = '${h(t("path14"))}';
        else path = '${h(t("pathOld"))}';
        document.getElementById('iosPath').innerHTML = '${h(t("detected"))} ' + v + '<br/>' + path;
      }
      function showGuide(){ setPath(); guide.style.display='block'; mask.style.display='block'; }
      function hideGuide(){ guide.style.display='none'; mask.style.display='none'; }

      document.getElementById('btnCopyDev').addEventListener('click', function(){ try { navigator.clipboard.writeText(devName); } catch(e){} });
      openBtn && openBtn.addEventListener('click', function(){ var s=openBtn.getAttribute('data-scheme')||''; if(s) location.href=s; });
      document.getElementById('btnCloseGuide').addEventListener('click', hideGuide);
      mask.addEventListener('click', hideGuide);

      // iOS：直接 itms-services，不阻塞；扣點背景送出
      installBtn.addEventListener('click', function(e){
        if (!isiOS()) return; // Android/桌面等不處理
        if (!isSafari()) {
          alert('請使用 Safari 開啟此頁面再安裝 iOS App');
        }
        // 背景扣點：不 await，避免丟失使用者手勢
        try {
          var payload = new Blob([JSON.stringify({ code: code, os: 'ipa' })], { type: 'application/json' });
          if (!navigator.sendBeacon || !navigator.sendBeacon('/api/dl/bill', payload)) {
            fetch('/api/dl/bill', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ code: code, os: 'ipa' })
            }).catch(function(){});
          }
        } catch (_) {}
        setTimeout(showGuide, 600);
        // 讓預設行為繼續（直接跳 itms-services）
      });
    }

    // Android：下載前扣點；成功才導向 /dl
    function bindBilling(btnId, os){
      var el = document.getElementById(btnId);
      if (!el) return;
      if (btnId === 'btn-ios') return; // iOS 不再走這條（避免 302→itms-services）
      el.addEventListener('click', async function(e){
        e.preventDefault();
        el.disabled = true; var ori = el.textContent; el.textContent = '...';
        try{
          var r = await fetch('/api/dl/bill', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: code, os: os })
          });
          if (r.status === 200) { location.href = el.getAttribute('href'); return; }
          if (r.status === 402) { alert('Insufficient points. Please recharge.'); }
          else { alert('Download check failed. Please retry later.'); }
        }catch(_){ alert('Network error. Please retry later.'); }
        finally{ el.disabled = false; el.textContent = ori; }
      });
    }
    bindBilling('btn-android', 'apk');
    // 不綁 'btn-ios'，因為 iOS 走直接 itms-services + 背景扣點
  })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
  });
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

