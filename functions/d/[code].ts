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

  const iosManifestUrl = `https://${new URL(ctx.request.url).host}/m/${encodeURIComponent(code)}`;
  const itmsUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(iosManifestUrl)}`;

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
</style>
<div class="wrap">
  <div class="card">
    <h1 style="margin:0 0 6px">${esc(title)}</h1>
    <div class="muted">短碼：<code>${esc(rec.code)}</code>${ver ? '　版本：<code>'+esc(ver)+'</code>' : ''}</div>

    <div style="margin-top:16px">
      ${hasApk ? `<a class="btn" href="/dl/${encodeURIComponent(rec.code)}?type=apk">📦 下載 Android APK</a>` : ''}
      ${hasIpa ? `<a class="btn" href="${itmsUrl}">🍎 安裝 iOS（itms-services）</a>` : ''}
      ${(!hasApk && !hasIpa) ? '<div class="muted" style="margin-top:8px">此連結尚未綁定任何檔案。</div>' : ''}
    </div>

    <div class="muted" style="margin-top:18px;font-size:13px">
      iOS 需企業/開發者簽名並信任憑證；Android 下載 APK 後須允許安裝未知來源。
    </div>
  </div>
</div>`;
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
