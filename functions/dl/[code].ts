// functions/dl/[code].ts
// 計數 + 轉址
export interface Env {
  LINKS: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url  = new URL(ctx.request.url);
  const code = String(ctx.params?.code || "");
  const p    = (url.searchParams.get("p") || "").toLowerCase(); // 'apk' | 'ios' | 'ipa'

  if (!code) return new Response("Bad Request", { status: 400 });

  const raw = await ctx.env.LINKS.get(`link:${code}`);
  if (!raw) return new Response("Not Found", { status: 404, headers: noStore() });

  const rec = JSON.parse(raw) as {
    code: string;
    apk_key?: string;
    ipa_key?: string;
  };

  // 目的地
  let destination = "";
  let type: "apk" | "ipa" | null = null;

  if (p === "apk") {
    if (!rec.apk_key) return new Response("APK Not Found", { status: 404, headers: noStore() });
    destination = `https://cdn.rudownload.win/${encodeURI(rec.apk_key)}`;
    type = "apk";
  } else if (p === "ios" || p === "ipa") {
    if (!rec.ipa_key) return new Response("IPA Not Found", { status: 404, headers: noStore() });
    const manifest = `https://app.rudownload.win/m/${encodeURIComponent(code)}`;
    destination = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifest)}`;
    type = "ipa";
  } else {
    // 未指定參數就回 400（可改成導回下載頁）
    return new Response("Missing p=apk|ios", { status: 400, headers: noStore() });
  }

  // 計數（不阻塞回應）
  if (type) ctx.waitUntil(incrCounters(ctx.env.LINKS, code, type));

  // 302 轉址到真正下載
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      ...noStore(),
    },
  });
};

// ===== 工具：計數（簡單 KV，自然有小機率併發丟失，但一般流量足夠） =====
async function incrCounters(KV: KVNamespace, code: string, type: "apk" | "ipa") {
  const now = Date.now();
  const yyyymmdd = new Date(now).toISOString().slice(0, 10).replace(/-/g, ""); // 20250915

  // 總數（全部 / 每類）
  await add1(KV, `cnt:${code}:total`);
  await add1(KV, `cnt:${code}:${type}:total`);

  // 今日（全部 / 每類），給 TTL 60 天，避免無限累積
  const ttl = 60 * 24 * 60 * 60; // 60 天（秒）
  await add1(KV, `cnt:${code}:day:${yyyymmdd}`, ttl);
  await add1(KV, `cnt:${code}:${type}:day:${yyyymmdd}`, ttl);
}

async function add1(KV: KVNamespace, key: string, ttlSeconds?: number) {
  const cur = parseInt((await KV.get(key)) || "0", 10) || 0;
  const putOpts = ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
  await KV.put(key, String(cur + 1), putOpts as any);
}

function noStore() {
  return {
    "cache-control": "no-store, private, max-age=0",
    "cdns-cache-control": "no-store",
    "x-robots-tag": "noindex",
  };
}
