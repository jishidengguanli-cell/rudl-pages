// functions/m/[code].ts
// 產生 iOS OTA 安裝用的 manifest.plist（itms-services 指向的目標）

export interface Env { LINKS: KVNamespace }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const code = ctx.params?.code as string;
  if (!code) return notFound();

  const raw = await ctx.env.LINKS.get(`link:${code}`);
  if (!raw) return notFound();

  const rec = JSON.parse(raw) as {
    code: string;
    title?: string;
    version?: string;         // 顯示用（使用者填）
    bundle_id?: string;       // 顯示用（使用者填）
    ipa_key?: string;         // R2/CDN 上的路徑
    ipaMeta?: {               // 從 IPA 解析出的真實資訊（若有）
      bundle_id?: string;
      version?: string;
    };
  };

  if (!rec.ipa_key) return notFound();

  const title   = rec.title || "App";
  const meta    = rec.ipaMeta || {};
  // 以 ipaMeta 優先，其次用顯示欄位，最後給預設
  const bundle  = meta.bundle_id || rec.bundle_id || `com.unknown.${rec.code}`;
  const version = meta.version  || rec.version  || "1.0";

  // RFC3986：逐段編碼但保留斜線，避免中文/空白/特殊字元
  const ipaPath = encodeRfc3986Path(rec.ipa_key.replace(/^\/+/, ""));
  const ipaUrl  = `https://cdn.rudownload.win/${ipaPath}`;

  // 正規、完整的 plist 內容（XML）
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
      // 關鍵：必須是 x-plist（或 application/xml 也可，但 x-plist 最穩）
      "content-type": "application/x-plist; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
};

function notFound() {
  return new Response("Not Found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

// 嚴格 XML 轉義（<&>\"）
function xml(s: any) {
  return String(s).replace(/[<&>"]/g, (m) =>
    m === "<" ? "&lt;"
    : m === ">" ? "&gt;"
    : m === "&" ? "&amp;"
    : "&quot;"
  );
}

// RFC3986：逐段編碼但保留斜線
function encodeRfc3986Path(path: string) {
  return path
    .split("/")
    .map(seg =>
      encodeURIComponent(seg).replace(/[!'()*]/g, c =>
        `%${c.charCodeAt(0).toString(16).toUpperCase()}`
      )
    )
    .join("/");
}
