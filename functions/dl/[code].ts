// functions/dl/[code].ts
import { deductForOwner } from '../_points';
export interface Env { LINKS: KVNamespace; POINTS: KVNamespace }

type LinkRecord = {
  code: string;
  title?: string;
  version2?: string;
  bundle_id?: string;
  lang?: string;
  apk_key?: string;
  apk_url?: string;     // 若你有直接存完整 URL，就用這個
  ipa_key?: string;
  uid?: string;         // 會員 UID（建議在建立 link 時就存這個）
  userId?: string;
  ownerUid?: string;
};

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const { request, env, params } = ctx;
  const code = String(params?.code || '');
  if (!code) return new Response('Invalid code', { status: 400 });

  const url = new URL(request.url);
  const p = url.searchParams.get('p');            // 'apk' | 'ios'
  if (p !== 'apk' && p !== 'ios') {
    return new Response('Missing ?p=apk|ios', { status: 400 });
  }

  const raw = await env.LINKS.get(`link:${code}`);
  if (!raw) return new Response('Not Found', { status: 404 });

  let rec: LinkRecord;
  try { rec = JSON.parse(raw) as LinkRecord; }
  catch { return new Response('Broken record', { status: 500 }); }

  // 取得「這個分發連結的擁有者」UID（以下三選一，請保證 link 記錄裡有其一）
  const ownerUid = rec.ownerUid || rec.uid || rec.userId;
  if (!ownerUid) {
    // 若你確定欄位名不同，請把這一行換成你的實際欄位
    return new Response('ownerUid missing in link record', { status: 500 });
  }

  // 先扣點（去重用 opId；以「平台+uid+code+時間」生成）
  const opId = `dl:${p}:${ownerUid}:${code}:${Date.now()}`;
  const r = await deductForOwner(env, ownerUid, p === 'apk' ? 'android' : 'ios', opId);
  if (!r.ok) {
    // 餘額不足 → 回 402 與簡易提示頁（你可改成導去某個說明頁）
    const html = `<!doctype html><meta charset="utf-8">
      <title>Insufficient balance</title>
      <div style="font-family:system-ui;padding:24px">
        <h1 style="margin:0 0 12px">Temporarily unavailable</h1>
        <p>The app owner has insufficient points. Please try again later.</p>
      </div>`;
    return new Response(html, { status: 402, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  // 扣點成功 → 轉向實際檔案 / iOS 安裝協議
  if (p === 'apk') {
    // Android：優先用 rec.apk_url；否則用你 CDN 與 apk_key 組 URL
    const apkUrl =
      rec.apk_url ||
      (rec.apk_key ? `https://cdn.rudownload.win/${encodeURIComponent(rec.apk_key)}` : undefined);

    if (!apkUrl) return new Response('APK not available', { status: 404 });
    return Response.redirect(apkUrl, 302);
  } else {
    // iOS：走 itms-services 串 manifest（你已有 functions/m/[code].ts）
    const manifestUrl = `${url.origin}/m/${encodeURIComponent(code)}`;
    const itms = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;
    return Response.redirect(itms, 302);
  }
};
