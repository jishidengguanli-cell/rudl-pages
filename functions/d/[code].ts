export interface Env { FILES: KVNamespace }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const code = ctx.params.code as string;
  const meta = await ctx.env.FILES.get(`file:${code}`, { type: "json" }) as any | null;
  if (!meta) return new Response("Not found", { status: 404 });

  const ua = ctx.request.headers.get("user-agent") || "";
  const isIOS = /(iPhone|iPad|iPod)/i.test(ua);
  const origin = new URL(ctx.request.url).origin; // 可在 pages.dev 或你的自訂網域下都正確

  const html = `<!doctype html><meta charset="utf-8">
  <title>${meta.title || "App"} ${meta.version || ""}</title>
  <style>body{font-family:sans-serif;padding:24px;max-width:680px;margin:auto}
  .btn{display:block;margin:12px 0;padding:12px 16px;border-radius:8px;background:#222;color:#fff;text-decoration:none;text-align:center}
  .note{color:#666;font-size:14px}</style>
  <h1>${meta.title || "App"} ${meta.version || ""}</h1>
  <p class="note">Code: ${code}</p>
  ${meta.apk_url ? `<a class="btn" href="/dl/${code}">下載 Android APK</a>` : ""}
  ${meta.ipa_url ? `<a class="btn" ${isIOS ? "" : "onclick='alert(\"請用 iPhone/iPad 開啟\");return false;'"}
     href="itms-services://?action=download-manifest&url=${encodeURIComponent(`${origin}/m/${code}.plist`)}">安裝到 iOS</a>` : ""}
  <p class="note">iOS 需已簽名 IPA；企業簽名需到「設定→一般→裝置管理」信任憑證。</p>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
};
