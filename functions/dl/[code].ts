// functions/dl/[code].ts
export interface Env { LINKS: KVNamespace }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const code = ctx.params?.code as string;
  if (!code) return j({ error: "missing code" }, 400);

  const raw = await ctx.env.LINKS.get(`link:${code}`);
  if (!raw) return j({ error: "not found" }, 404);
  const rec = JSON.parse(raw) as { apk_key?: string; ipa_key?: string; code: string };

  const url = new URL(ctx.request.url);
  let type = url.searchParams.get("type"); // 'apk' | 'ipa' | null
  if (!type) {
    const ua = (ctx.request.headers.get("user-agent") || "").toLowerCase();
    if (/android/.test(ua) && rec.apk_key) type = "apk";
    else if (/(iphone|ipad|ipod|ios|like mac os x)/.test(ua) && rec.ipa_key) type = "ipa";
  }

  if (type === "apk" && rec.apk_key) {
    return redirect(`https://cdn.rudownload.win/${encodeURI(rec.apk_key)}`);
  }
  if (type === "ipa" && rec.ipa_key) {
    const iosManifestUrl = `https://${new URL(ctx.request.url).host}/m/${encodeURIComponent(code)}`;
    const itms = `itms-services://?action=download-manifest&url=${encodeURIComponent(iosManifestUrl)}`;
    return redirect(itms);
  }

  // 沒有合適檔案 → 回下載頁
  return redirect(`/d/${encodeURIComponent(code)}`);
};

function redirect(loc: string) {
  return new Response("", { status: 302, headers: { "location": loc, "cache-control": "no-store" } });
}
function j(obj: any, status=200){ return new Response(JSON.stringify(obj), { status, headers:{ "content-type":"application/json; charset=utf-8", "cache-control":"no-store" } }); }
