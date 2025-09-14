export const onRequestGet: PagesFunction = async (ctx) => {
  const code = ctx.params.code as string;
  const isIOS = /iPhone|iPad|iPod/i.test(ctx.request.headers.get("user-agent") || "");
  const html = `<!doctype html><meta charset="utf-8">
  <title>Download ${code}</title>
  <style>body{font-family:sans-serif;padding:24px;max-width:680px;margin:auto}
  .btn{display:block;margin:12px 0;padding:12px 16px;border-radius:8px;background:#222;color:#fff;text-decoration:none;text-align:center}</style>
  <h1>下載頁 ${code}</h1>
  <a class="btn" href="/dl/${code}">下載 Android APK</a>
  <a class="btn" ${isIOS ? "" : "onclick='alert(\"請用 iPhone/iPad 開啟\");return false;'"}
     href="itms-services://?action=download-manifest&url=${encodeURIComponent(`https://app.rudownload.win/m/${code}.plist`)}">安裝到 iOS</a>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
