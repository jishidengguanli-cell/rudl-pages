// functions/m/[code].ts
export interface Env { LINKS: KVNamespace }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const code = ctx.params?.code as string;
  if (!code) return notFound();

  const raw = await ctx.env.LINKS.get(`link:${code}`);
  if (!raw) return notFound();

  type Meta = {
    bundle_id?: string;
    version?: string;
    // 盡量覆蓋各種可能的鍵名（你後端解析 IPA 時可存其中之一）
    display_name?: string;
    name?: string;
    CFBundleDisplayName?: string;
    CFBundleName?: string;
  };
  const rec = JSON.parse(raw) as {
    code: string;
    title?: string;      // 分發時填的名稱（僅後備）
    version?: string;    // 分發時填的版本（後備）
    bundle_id?: string;  // 分發時填的 BundleID（後備）
    ipa_key?: string;
    ipaMeta?: Meta;
  };
  if (!rec.ipa_key) return notFound();

  const meta = rec.ipaMeta || {};

  // 1) 名稱：優先 IPA 內的 display_name/name/...，最後才用分發填的
  const title =
    meta.display_name ||
    meta.name ||
    meta.CFBundleDisplayName ||
    meta.CFBundleName ||
    rec.title ||
    "App";

  // 2) 版本/BundleId 也一律優先 IPA 內 meta，其次才用分發欄位
  const version = meta.version || rec.version || "1.0";
  const bundle  = meta.bundle_id || rec.bundle_id || `com.unknown.${rec.code}`;

  // RFC3986 逐段編碼（保留斜線）
  const ipaPath = encodeRfc3986Path(rec.ipa_key.replace(/^\/+/, ""));
  const ipaUrl  = `https://cdn.rudownload.win/${ipaPath}`;

  // 合法的 OTA manifest.plist
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>items</key>
    <array>
      <dict>
        <key>assets</key>
        <array>
          <dict>
            <key>kind</key><string>software-package</string>
            <key>url</key><string>${xml(ipaUrl)}</string>
          </dict>
        </array>
        <key>metadata</key>
        <dict>
          <key>bundle-identifier</key><string>${xml(bundle)}</string>
          <key>bundle-version</key><string>${xml(version)}</string>
          <key>kind</key><string>software</string>
          <key>title</key><string>${xml(title)}</string>
        </dict>
      </dict>
    </array>
  </dict>
</plist>`;

  return new Response(plist, {
    headers: {
      "content-type": "application/x-plist; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
};

function notFound() {
  return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
}
function xml(s: any) {
  return String(s).replace(/[<&>"]/g, (m) =>
    m === "<" ? "&lt;" : m === ">" ? "&gt;" : m === "&" ? "&amp;" : m
  );
}
// RFC3986：逐段編碼，但保留斜線
function encodeRfc3986Path(path: string) {
  return path
    .split("/")
    .map(seg => encodeURIComponent(seg).replace(/[!'()*]/g, c =>
      `%${c.charCodeAt(0).toString(16).toUpperCase()}`
    ))
    .join("/");
}
