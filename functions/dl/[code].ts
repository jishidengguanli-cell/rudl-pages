// functions/dl/[code].ts
// /dl/:code?p=apk | /dl/:code?p=ios
// 說明：本檔只做「讀 link → 組目標 → 302 轉向」
// ＊扣點與 1 分鐘去重已移到 POST /api/dl/bill
// ＊任何統計（cnt<code>*）也在 /api/dl/bill 成功時遞增

export interface Env {
  LINKS: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const { request, env, params } = ctx;

  const url  = new URL(request.url);
  const code = String(params?.code || "").trim();
  if (!code) return text("Invalid code", 400);

  // 讀取 link 記錄
  const raw = await env.LINKS.get(`link:${code}`);
  if (!raw) return text("Not Found", 404);

  type Rec = {
    code: string;
    title?: string;
    version?: string;
    bundle_id?: string;
    lang?: string;
    apk_key?: string;     // R2/CDN 上的檔案 key（如 android/xxx.apk）
    ipa_key?: string;     // R2/CDN 上的檔案 key（如 ios/xxx.ipa）
    owner?: string;       // 擁有者 UID（僅用於其他 API；此檔不做點數與計數）
    uid?: string; userId?: string; ownerUid?: string;
    apk_url?: string;     // 若你有預先存完整網址，也可用這個
    ipa_url?: string;     // 同上
  };

  let rec: Rec;
  try {
    rec = JSON.parse(raw);
  } catch {
    return text("Broken record", 500);
  }

  // 解析平台與目的地
  const p = url.searchParams.get("p"); // 'apk' | 'ios'
  let destination = "";

  if (p === "apk") {
    // Android：直接給檔案網址
    if (rec.apk_url) {
      destination = rec.apk_url;
    } else if (rec.apk_key) {
      destination = `https://cdn.rudownload.win/${encodeURI(rec.apk_key)}`;
    } else {
      return text("APK Not Found", 404);
    }
  } else if (p === "ios" || p === "ipa") {
    // iOS：走 itms-services + manifest（由 /m/:code 提供）
    if (rec.ipa_url) {
      // 假如你有直接存 plist 連結，也可改用 rec.ipa_url
      destination = rec.ipa_url;
    } else if (rec.ipa_key) {
      const manifest = `${url.origin}/m/${encodeURIComponent(code)}`;
      destination = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifest)}`;
    } else {
      return text("IPA Not Found", 404);
    }
  } else {
    return text("Missing p=apk|ios", 400);
  }

  // 302 轉向到真正目的地
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      ...noStore(),
    },
  });
};

/* ---------------- helpers ---------------- */

function text(msg: string, status = 200) {
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
