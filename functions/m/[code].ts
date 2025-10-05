// functions/m/[code].ts
export interface Env { LINKS: KVNamespace }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const code = ctx.params?.code as string;
  if (!code) return notFound();

  const raw = await ctx.env.LINKS.get(`link:${code}`);
  if (!raw) return notFound();
  const rec = JSON.parse(raw) as {
    code: string;
    title?: string;
    version?: string;   // 顯示用
    bundle_id?: string; // 顯示用
    ipa_key?: string;
    ipaMeta?: { bundle_id?: string; version?: string };
  };
  if (!rec.ipa_key) return notFound();

  const title   = rec.title || "App";
  const meta    = rec.ipaMeta || {};
  // 優先使用 ipaMeta（自動偵測），其次才用顯示欄位；兩者都沒有才給預設
  const bundle  = meta.bundle_id || rec.bundle_id || `com.unknown.${rec.code}`;
  const version = meta.version    || rec.version    || "1.0";

  // 以 RFC3986 逐段編碼路徑，避免空白/非 ASCII/特殊字元問題
  const ipaPath = encodeRfc3986Path(rec.ipa_key.replace(/^\/+/, ""));
  const ipaUrl  = `https://cdn.rudownload.win/${ipaPath}`;

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
      // 關鍵修正：新版 iOS 要更正確的 plist MIME
      "content-type": "application/x-plist; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff"
    }
  });
};

function notFound() {
  return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
}
function xml(s: any){ return String(s).replace(/[<&>"]/g, m=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[m])); }
// RFC3986：逐段編碼，但保留斜線
function encodeRfc3986Path(path: string) {
  return path
    .split("/")
    .map(seg => encodeURIComponent(seg).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
    .join("/");
}
