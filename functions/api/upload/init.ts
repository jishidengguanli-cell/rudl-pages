// functions/api/upload/init.ts
// 回傳可用 10 分鐘的 R2「PUT 預簽名 URL」
// 需要 Pages 環境變數：R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

export interface Env {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
}

type ReqBody = {
  filename: string;        // 原始檔名（用來取副檔名）
  folder?: string;         // 例如 "android" / "ios"（可選）
  contentType?: string;    // 例如 "application/vnd.android.package-archive"
  // 也可以加你要的 metadata 欄位，這裡從簡
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const body = (await ctx.request.json()) as ReqBody;
    if (!body?.filename) {
      return json({ error: "filename required" }, 400);
    }

    const ext = body.filename.split(".").pop()?.toLowerCase();
    if (!ext || !["apk", "ipa"].includes(ext)) {
      return json({ error: "invalid file extension" }, 400);
    }

    // 你可以自訂 key 規則（版本/時間/隨機碼）
    const safeFolder = (body.folder || (ext === "apk" ? "android" : "ios"))
      .replace(/^\/+|\/+$/g, "");
    const code = randomCode(8);
    const key = `${safeFolder}/${Date.now()}-${code}.${ext}`;

    const contentType =
      body.contentType ||
      (ext === "apk"
        ? "application/vnd.android.package-archive"
        : "application/octet-stream");

    const url = await presignPutUrl({
      accountId: ctx.env.R2_ACCOUNT_ID,
      accessKeyId: ctx.env.R2_ACCESS_KEY_ID,
      secretKey: ctx.env.R2_SECRET_ACCESS_KEY,
      bucket: ctx.env.R2_BUCKET,
      key,
      contentType,
      expiresSec: 600, // 有效 10 分鐘
    });

    return json({ uploadUrl: url, key, contentType }, 200);
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 500);
  }
};

// ===== v4 簽名（Presign）實作：Workers/Pages 可直接用 WebCrypto =====

async function presignPutUrl(opts: {
  accountId: string;
  accessKeyId: string;
  secretKey: string;
  bucket: string;
  key: string;
  contentType?: string;
  expiresSec: number;
}): Promise<string> {
  const { accountId, accessKeyId, secretKey, bucket, key, contentType, expiresSec } =
    opts;
  const method = "PUT";
  const service = "s3";
  const region = "auto";
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const amzDate = toAmzDate(new Date()); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8); // YYYYMMDD
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  // Canonical URI：必須是 /{bucket}/{key}
  const canonicalUri = `/${encodeURIComponent(bucket)}/${encodeRfc3986Path(key)}`;

  // 我們用「查詢字串」方式簽名（presign）
  // 注意：查詢參數必須排序
  const qp: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expiresSec)],
    [
      "X-Amz-SignedHeaders",
      contentType ? "content-type;host" : "host",
    ],
  ];
  const canonicalQuery = qp
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .sort()
    .join("&");

  const signedHeaders = contentType ? "content-type;host" : "host";
  const canonicalHeaders = (
    (contentType ? `content-type:${contentType}\n` : "") + `host:${host}\n`
  );

  const payloadHash = "UNSIGNED-PAYLOAD";
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const hashCanonical = await sha256Hex(canonicalRequest);
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${hashCanonical}`;
  const signingKey = await getSigningKey(secretKey, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const baseUrl = `https://${host}${canonicalUri}`;
  const url =
    `${baseUrl}?${canonicalQuery}&X-Amz-Signature=${signature}`;

  return url;
}

// ===== Utilities =====
function toAmzDate(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mi = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function encodeRfc3986Path(path: string) {
  // S3 要求每個 segment 做 RFC3986 encode，但保留斜線
  return path
    .split("/")
    .map((seg) =>
      encodeURIComponent(seg)
        .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    )
    .join("/");
}

async function sha256Hex(input: string | ArrayBuffer) {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return buf2hex(digest);
}

async function hmac(key: ArrayBuffer, data: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function getSigningKey(secretKey: string, date: string, region: string, service: string) {
  const kDate = await hmac(new TextEncoder().encode("AWS4" + secretKey), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  return kSigning;
}

async function hmacHex(key: ArrayBuffer, data: string) {
  const sig = await hmac(key, data);
  return buf2hex(sig);
}

function buf2hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomCode(n = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
