// functions/dl/[code].ts
// 下載入口：?p=apk / ?p=ios
// 規則：apk 扣 3 點、ios 扣 5 點；點數存於 KV: POINTS（key: points:<ownerUid>）

import { deductForOwner } from '../_points.js';

export interface Env {
  LINKS: KVNamespace;
  POINTS: KVNamespace; // 這裡加上型別，僅作為提示；實際仍由 _points.js 讀取 env.POINTS
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url  = new URL(ctx.request.url);
  const code = String(ctx.params?.code || '');
  if (!code) return new Response('Invalid code', { status: 400, headers: noStore() });

  // 讀取 link 紀錄（和 /d/[code].ts 相同來源）
  const raw = await ctx.env.LINKS.get(`link:${code}`);
  if (!raw) return new Response('Not Found', { status: 404, headers: noStore() });

  type Rec = {
    code: string;
    title?: string;
    version?: string;
    bundle_id?: string;
    lang?: string;
    apk_key?: string;
    ipa_key?: string;
    uid?: string; userId?: string; ownerUid?: string; // 擁有者 UID 可能的欄位名
  };

  let rec: Rec;
  try { rec = JSON.parse(raw); }
  catch { return new Response('Broken record', { status: 500, headers: noStore() }); }

  // 解析平台參數與目的地（destination）
  const p = url.searchParams.get('p'); // 'apk' | 'ios'
  let destination = '';
  let type: 'apk' | 'ipa' | '' = '';

  if (p === 'apk') {
    if (!rec.apk_key) return new Response('APK Not Found', { status: 404, headers: noStore() });
    destination = `https://cdn.rudownload.win/${encodeURI(rec.apk_key)}`;
    type = 'apk';
  } else if (p === 'ios' || p === 'ipa') {
    if (!rec.ipa_key) return new Response('IPA Not Found', { status: 404, headers: noStore() });
    // iOS 走 itms-services，plist 由你現有的 /m/[code] 生成
    const manifest = `${url.origin}/m/${encodeURIComponent(code)}`;
    destination = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifest)}`;
    type = 'ipa';
  } else {
    return new Response('Missing p=apk|ios', { status: 400, headers: noStore() });
  }

  // 取 link 擁有者（會員）UID —— 用你實際的欄位，以下三選一即可
  const ownerUid = rec.uid || rec.userId || rec.ownerUid;
  if (!ownerUid) return new Response('Owner not found', { status: 500, headers: noStore() });

  // 產生去重鍵（避免重覆扣點；7 天內重覆下載可被視為同一 opId 即不再扣）
  const opId = `dl:${type === 'apk' ? 'android' : 'ios'}:${ownerUid}:${code}:${Date.now()}`;

  // ★ 先扣點（apk=android、ipa=ios），失敗就不要送檔
  const deduct = await deductForOwner(ctx.env, ownerUid, type === 'apk' ? 'android' : 'ios', opId);
  if (!deduct.ok) {
    return new Response('The download is temporarily unavailable (insufficient points).', {
      status: deduct.status || 402,
      headers: { 'content-type': 'text/plain; charset=utf-8', ...noStore() },
    });
  }

  // 非阻塞下載統計（你原本就有的統計邏輯）
  try { ctx.waitUntil(incrCounters(ctx.env.LINKS, code, type)); } catch {}

  // 最後才 302 導到實際目的地
  return new Response(null, {
    status: 302,
    headers: { Location: destination, ...noStore() },
  });
};

/* 說明：
   - noStore()、incrCounters() 為你既有的工具；這裡沿用既有名稱與用法。
   - _points.js 內部會使用 env.POINTS（KV 命名需為 POINTS）。
   - ownerUid 欄位請以你的 LINKS 紀錄實際欄位為準（常見 uid / userId / ownerUid）。
*/
