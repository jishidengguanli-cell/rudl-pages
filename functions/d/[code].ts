// functions/d/[code].ts
// 下載頁（顯示資訊 + 下載按鈕 + iOS 引導面板）

export interface Env {
  LINKS: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const code = String(ctx.params?.code || "");
  if (!code) return resp404("Invalid code");

  const raw = await ctx.env.LINKS.get(`link:${code}`);
  if (!raw) return resp404("Not Found");

  type Rec = {
    code: string;
    title?: string;
    version?: string;   // 顯示用
    bundle_id?: string; // 顯示用
    apk_key?: string;
    ipa_key?: string;
    ipaMeta?: { bundle_id?: string; version?: string; dev_name?: string };
    createdAt?: number;
  };

  let rec: Rec;
  try { rec = JSON.parse(raw); } catch { return resp404("Broken record"); }

  const hasApk = !!rec.apk_key;
  const hasIpa = !!rec.ipa_key;

  const title   = rec.title || "App";
  const verDisp = rec.version || rec.ipaMeta?.version || "";
  const bidDisp = rec.bundle_id || rec.ipaMeta?.bundle_id || "";
  // 開發者名稱（若有解析可帶過來；沒有就用通用字）
  const devName = rec.ipaMeta?.dev_name || "Enterprise Developer";

  // 下載按鈕：走 /dl 以便計數；/dl 會再 302 到 CDN / itms-services
  const hrefApk = `/dl/${encodeURIComponent(rec.code)}?p=apk`;
  const hrefIos = `/dl/${encodeURIComponent(rec.code)}?p=ios`;

  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${h(title)} - 下載</title>
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
    .meta{display:grid;grid-template-columns:120px 1fr;gap:6px 10px;margin-top:8px}
    code,kbd{background:#0b1222;border:1px solid #334155;border-radius:8px;padding:2px 6px}
    .hero{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .hero h1{margin:0;font-size:22px}
    .btns{display:flex;gap:10px;margin-top:16px}
    .tip{margin-top:10px;font-size:14px;color:#9ca3af}
    .footer{color:#9ca3af;text-align:center;margin:18px 0}
    /* iOS 引導樣式 */
    .guide-mask{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;z-index:9999}
    .guide{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);
      width:min(520px,92vw);background:#0b1220;color:#e5e7eb;border:1px solid #1f2937;border-radius:14px;
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
        <div class="muted">下載頁 · <code>${h(rec.code)}</code></div>
      </nav>
    </div>
  </header>

  <main class="wrap">
    <section class="card">
      <div class="meta">
        <div class="muted">版本</div><div>${h(verDisp || "-")}</div>
        //<div class="muted">Bundle ID</div><div>${h(bidDisp || "-")}</div>
        <div class="muted">平台</div>
        <div>
          ${hasApk ? '<span>Android APK</span>' : '<span class="muted">Android（無）</span>'}
          &nbsp;·&nbsp;
          ${hasIpa ? '<span>iOS IPA</span>' : '<span class="muted">iOS（無）</span>'}
        </div>
      </div>

      <div class="btns">
        ${hasApk ? `<a class="btn" href="${attr(hrefApk)}" id="btn-android">Android 下載</a>` : ""}
        ${hasIpa ? `<a class="btn" href="${attr(hrefIos)}" id="btn-ios" data-dev="${attr(devName)}">iOS 安裝</a>` : ""}
        ${!hasApk && !hasIpa ? `<span class="muted">尚未上傳可下載的檔案。</span>` : ""}
      </div>

      <div class="tip">提示：iOS 第一次安裝企業 App 需要到「設定」→「一般」→「VPN 與裝置管理 / 描述檔與裝置管理」中信任開發者。</div>
    </section>

    <div class="footer">© ${new Date().getFullYear()} RU Download</div>
  </main>

  <!-- iOS 安裝後引導 -->
  <div class="guide-mask" id="iosGuideMask"></div>
  <div class="guide" id="iosGuide" style="display:none" role="dialog" aria-modal="true" aria-labelledby="iosGuideTitle">
    <h3 id="iosGuideTitle">下一步：啟用企業 App</h3>
    <div class="muted" id="iosPath">正在判斷 iOS 版本…</div>
    <ol class="steps" id="iosSteps">
      <li>安裝完成後，先不要直接開啟 App。</li>
      <li>打開 <b>設定</b> → <b>一般</b> → <b>VPN 與裝置管理</b>（或「描述檔與裝置管理」）。</li>
      <li>點選 <b>開發者 App</b> 內的「<span id="devName">${h(devName)}</span>」→ <b>信任</b> → <b>驗證</b>。</li>
      <li>回到桌面再開啟 App。</li>
    </ol>

    <div class="row">
      <button class="btn ghost" id="btnCopyDev" type="button">複製開發者名稱</button>
      <!-- 若你的 App 有自訂 URL Scheme，可動態塞到 data-scheme；沒有就隱藏按鈕 -->
      <button class="btn" id="btnOpenApp" type="button" data-scheme="">嘗試開啟 App</button>
      <button class="btn red" id="btnCloseGuide" type="button">關閉</button>
    </div>
    <div class="footer">
      <span class="muted">＊信任步驟僅需一次，此後更新同源 App 無需重複</span>
    </div>
  </div>

  <script>
  (function(){
    // 如果沒有 iOS 安裝按鈕，直接略過引導
    var installBtn = document.getElementById('btn-ios');
    if(!installBtn) return;

    // 開發者名稱：優先用 data-dev → 再用 window.__DEV_NAME__ → 預設
    var devName = installBtn.getAttribute('data-dev') || (window.__DEV_NAME__ || 'Enterprise Developer');
    document.getElementById('devName').textContent = devName;

    //（可選）App 的 URL Scheme，如果你有要提供「嘗試開啟 App」按鈕
    var schemeFromGlobal = (window.__APP_SCHEME__ || '');
    var openBtn = document.getElementById('btnOpenApp');
    if (schemeFromGlobal) openBtn.setAttribute('data-scheme', schemeFromGlobal);
    if (!openBtn.getAttribute('data-scheme')) openBtn.style.display = 'none';

    var mask  = document.getElementById('iosGuideMask');
    var guide = document.getElementById('iosGuide');

    function isiOS(){ return /iP(hone|od|ad)/.test(navigator.userAgent); }
    function iOSMajor(){
      var m = navigator.userAgent.match(/OS (\\d+)_/i);
      return m ? parseInt(m[1],10) : null;
    }
    function setPath(){
      var v = iOSMajor() || 17;
      var path;
      if (v >= 16) path = '設定 → 一般 → <b>VPN 與裝置管理</b> → 開發者 App → 信任';
      else if (v >= 14) path = '設定 → 一般 → <b>描述檔與裝置管理</b> → 開發者 App → 信任';
      else path = '設定 → 一般 → <b>裝置管理 / 描述檔</b> → 開發者 App → 信任';
      document.getElementById('iosPath').innerHTML = '偵測到 iOS ' + v + '，請依此路徑前往：<br>' + path;
    }
    function showGuide(){ setPath(); guide.style.display='block'; mask.style.display='block'; }
    function hideGuide(){ guide.style.display='none'; mask.style.display='none'; }

    document.getElementById('btnCopyDev').addEventListener('click', function(){
      try { navigator.clipboard.writeText(devName); } catch(e){}
    });
    openBtn && openBtn.addEventListener('click', function(){
      var scheme = openBtn.getAttribute('data-scheme') || '';
      if (!scheme) return;
      location.href = scheme;
    });
    document.getElementById('btnCloseGuide').addEventListener('click', hideGuide);
    mask.addEventListener('click', hideGuide);

    // 關鍵：點 iOS 安裝 → 觸發 itms-services → 稍後彈出引導
    installBtn.addEventListener('click', function(){
      if (!isiOS()) return;
      setTimeout(showGuide, 600);
    });
  })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
};

function resp404(msg: string) {
  return new Response(msg || "Not Found", { status: 404, headers: { "cache-control": "no-store" } });
}

// HTML/屬性跳脫，避免 XSS / 破版
function h(s: any) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => (
    m === "&" ? "&amp;" :
    m === "<" ? "&lt;"  :
    m === ">" ? "&gt;"  :
    m === '"' ? "&quot;":
                "&#39;"
  ));
}
function attr(s: any) {
  return h(s).replace(/"/g, "&quot;");
}
