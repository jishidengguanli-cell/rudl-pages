export interface Env { FILES: KVNamespace }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const code = (ctx.params.code as string).replace(/\.plist$/i, "");
  const meta = await ctx.env.FILES.get(`file:${code}`, { type: "json" }) as any | null;
  if (!meta || !meta.ipa_url || !meta.bundle_id || !meta.version) {
    return new Response("manifest data missing", { status: 404 });
  }
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>items</key><array><dict>
  <key>assets</key><array><dict>
    <key>kind</key><string>software-package</string>
    <key>url</key><string>${meta.ipa_url}</string>
  </dict></array>
  <key>metadata</key><dict>
    <key>bundle-identifier</key><string>${meta.bundle_id}</string>
    <key>bundle-version</key><string>${meta.version}</string>
    <key>kind</key><string>software</string>
    <key>title</key><string>${meta.title || "App"}</string>
  </dict>
</dict></array></dict></plist>`;
  return new Response(plist, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "no-store" }
  });
};
