// functions/dl/[code].ts
// /dl/:code?p=apk | /dl/:code?p=ios (/ipa)
// 說明：只做「讀 link → 組目標 → 302 轉向」
// ＊扣點與統計交由 POST /api/dl/bill 處理
// ＊這裡會在背景 fire-and-forget 觸發 /api/dl/bill，並把 ios 正規化成 ipa

export interface Env {
  LINKS: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const { request, env, params } = ctx;
  const url  = new URL(request.url);
  const code = String(params?.code || "").trim();
  if (!code) return plain("Invalid code", 400);

  // 讀取 link 記錄
  const raw = await env.LINKS.get(`link:${code}`);
  if (!raw) return plain("Not Found", 404);

  type Rec = {
    code: string;
    title?: string;
    version?: string;
    bundle_id?: string;
    lang?: string;
    apk_key?: string;   // 例如 android/xxx.apk
    ipa_key?: string;   // 例如 ios/xxx.ipa
    apk_url?: string;   // 若已存完整網址也可用
    ipa_url?: string;
  };

  let rec: Rec;
  try {
    rec = JSON.parse(raw);
  } catch {
    return plain("Broken record", 500);
  }

  // ---- 解析平台 ----
  let p = (url.searchParams.get("p") || "").toLowerCase(); // 'apk' | 'ios' | 'ipa' | ''
  if (!p) {
    // 若只上傳了其中一種檔案，沒帶 p 時自動推論
    if (rec.apk_key && !rec.ipa_key) p = "apk";
    else if (!rec.apk_key && rec.ipa_key) p = "ios";
  }
  // ios 正規化成 ipa（/api/dl/bill 與統計用 'ipa' 比較一致）
  const plat = p === "apk" ? "apk" : "ipa";

  // ---- 找轉址目標 ----
  let destination = "";

  if (plat === "apk") {
    if (rec.apk_url) destination = rec.apk_url;
    else if (rec.apk_key) destination = cdn(rec.apk_key);
    else return plain("APK Not Found", 404);
  } else {
    // iOS 走 itms-services，指向 /m/:code（由 manifest 產出 plist）
    if (rec.ipa_url) destination = rec.ipa_url;
    else if (rec.ipa_key) {
      const manifest = `${url.origin}/m/${encodeURIComponent(code)}`;
      destination = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifest)}`;
    } else return plain("IPA Not Found", 404);
  }

  // ---- 背景通知 /api/dl/bill 做扣點與統計（不阻塞下載）----
  // 這裡只傳 code 與 plat（apk/ipa），其他 dedupe/扣點/計數請在 /api/dl/bill 處理
  ctx.waitUntil(postBill(url, code, plat));

  // ---- 302 轉向到真正目的地 ----
  return new Response(null, {
    status: 302,
    headers: { Location: destination, ...noStore() },
  });
};

/* ---------------- helpers ---------------- */

function cdn(key: string) {
  // 你的 R2 自訂網域；若未來改動，只需改這裡
  return `https://cdn.rudownload.win/${encodeURI(key.replace(/^\/+/, ""))}`;
}

function plain(msg: string, status = 200) {
  return new Response(msg, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...noStore() },
  });
}

function noStore() {
  return {
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    pragma: "no-cache",
  };
}

/** fire-and-forget 呼叫 /api/dl/bill；任何錯誤都吞掉避免影響下載 */
async function postBill(originUrl: URL, code: string, plat: "apk" | "ipa") {
  try {
    const endpoint = new URL("/api/dl/bill", originUrl).toString();
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, plat }),
      // 禁止快取：確保每次請求都會到達 function
      cf: { cacheTtl: 0, cacheEverything: false } as any,
    });
  } catch {
    // 靜默失敗，不影響轉向
  }
}
