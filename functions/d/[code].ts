// functions/d/[code].ts
export interface Env { LINKS: KVNamespace }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const code = ctx.params?.code as string;
  if (!code) return notFound("Missing code");

  const raw = await ctx.env.LINKS.get(`link:${code}`);
  if (!raw) return notFound("Link not found");
  const rec = JSON.parse(raw) as {
    code: string; title?: string; version?: string; bundle_id?: string;
    apk_key?: string; ipa_key?: string; createdAt?: number;
  };

  const title = rec.title || "App";
  const ver = rec.version || "";
  const hasApk = !!rec.apk_key;
  const hasIpa = !!rec.ipa_key;

  const androidHref = `/dl/${rec.code}?p=apk`;
  const iosHref     = `/dl/${rec.code}?p=ios`;

  const html = `<!doctype html>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)} - Download</title>
<style>
  body{margin:0;background:#0f172a;color:#e5e7eb;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:680px;margin:0 auto;padding:24px}
  .card{background:#111827;border:1px solid #1f2937;border-radius:16px;padding:24px;margin-top:24px}
  .muted{color:#9ca3af}
  .btn{display:inline-block;padding:12px 16px;border-radius:12px;border:0;background:#3b82f6;color:#fff;text-decoration:none;margin:6px 8px 0 0}
  .btn.gray{background:#374151}
  code{background:#0b1222;border:1px solid #334155;padding:2px 6px;border-radius:6px}
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
<div class="wrap">
  <div class="card">
    <h1 style="margin:0 0 6px">${esc(title)}</h1>
    <div class="muted">短碼：<code>${esc(rec.code)}</code>${ver ? '　版本：<code>'+esc(ver)+'</code>' : ''}</div>

    <div style="margin-top:16px">
      ${hasApk ? `<a class="btn" href="${androidHref}">Android 下載</a>` : ''}
      ${hasIpa ? `<a id="btn-ios" class="btn" href="${iosHref}">iOS 安裝</a>` : ''}
      ${(!hasApk && !hasIpa) ? '<div class="muted" style="margin-top:8px">此連結尚未綁定任何檔案。</div>' : ''}
    </div>

    <div class="muted" style="margin-top:18px;font-size:13px">
      iOS 需企業/開發者簽名並信任憑證；Android 下載 APK 後須允許安裝未知來源。
    </div>
  </div>
</div>`;
  
<script>
(function(){
  // 1) 找到你的 iOS 安裝按鈕（支援 id 或 data 屬性）
  const installBtn =
    document.querySelector('#btn-ios, a[data-ios-install], button[data-ios-install]');
  if(!installBtn) return; // 頁面沒有 iOS 安裝按鈕就直接跳出

  // 2) 開發者名稱與 URL Scheme 來源：
  // 先取安裝按鈕 data-dev / data-scheme → 再取全域變數 → 再用預設字串
  const devName =
    installBtn.getAttribute('data-dev')
    || (window.__DEV_NAME__ || 'Your Company, Inc.');

  const appScheme =
    installBtn.getAttribute('data-scheme')
    || (window.__APP_SCHEME__ || '');

  // 把開發者名稱放進面板
  const devEl = document.getElementById('devName');
  if (devEl) devEl.textContent = devName;

  const mask  = document.getElementById('iosGuideMask');
  const guide = document.getElementById('iosGuide');

  function isiOS(){ return /iP(hone|od|ad)/.test(navigator.userAgent); }
  function iOSMajor(){
    const m = navigator.userAgent.match(/OS (\d+)_/i);
    return m ? parseInt(m[1],10) : null;
  }
  function setPath(){
    const v = iOSMajor() || 17;
    let path;
    if (v >= 16) path = '設定 → 一般 → <b>VPN 與裝置管理</b> → 開發者 App → 信任';
    else if (v >= 14) path = '設定 → 一般 → <b>描述檔與裝置管理</b> → 開發者 App → 信任';
    else path = '設定 → 一般 → <b>裝置管理 / 描述檔</b> → 開發者 App → 信任';
    const el = document.getElementById('iosPath');
    if (el) el.innerHTML = `偵測到 iOS ${v}，請依此路徑前往：<br>${path}`;
  }
  function showGuide(){
    setPath();
    guide.style.display = 'block';
    mask.style.display  = 'block';
  }
  function hideGuide(){
    guide.style.display = 'none';
    mask.style.display  = 'none';
  }

  // 3) 互動：複製開發者名稱、嘗試開啟 App、自動顯示面板
  document.getElementById('btnCopyDev')?.addEventListener('click', async ()=>{
    try{ await navigator.clipboard.writeText(devName); }catch(e){}
  });

  const openBtn = document.getElementById('btnOpenApp');
  if (appScheme && openBtn) openBtn.setAttribute('data-scheme', appScheme);
  if (!appScheme && openBtn) openBtn.style.display = 'none';

  openBtn?.addEventListener('click', ()=>{
    const scheme = openBtn.getAttribute('data-scheme') || '';
    if (!scheme) return;
    // 嘗試打開自訂 URL Scheme（你的 App 要有設定）
    location.href = scheme;
  });

  document.getElementById('btnCloseGuide')?.addEventListener('click', hideGuide);
  mask.addEventListener('click', hideGuide);

  // 4) 關鍵：使用者點了「安裝 iOS」→ 讓 itms-services 跳出後，延遲顯示引導面板
  installBtn.addEventListener('click', function(){
    if (!isiOS()) return;    // 非 iOS 就不顯示
    // 給系統 itms-services 彈窗一點時間，再顯示引導
    setTimeout(showGuide, 600);
  });
})();
</script>
  
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" }
  });
};

function notFound(msg: string) {
  return new Response(`<!doctype html><meta charset="utf-8"><title>Not Found</title><pre>${esc(msg)}</pre>`, {
    status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
  });
}
function esc(s: any){ return String(s).replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[m])); }


