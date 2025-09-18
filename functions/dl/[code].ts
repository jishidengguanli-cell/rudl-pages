// functions/dl/[code].ts
// /dl/:code?p=apk | /dl/:code?p=ios
// 規則：apk 扣 3 點、ios 扣 5 點；餘額在 KV: POINTS（key: points:<ownerUid>）

import { deductForOwner } from '../_points.js';

export interface Env {
  LINKS: KVNamespace;
  POINTS: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url  = new URL(ctx.request.url);
  const code = String(ctx.params?.code || '');
  if (!code) return text('Invalid code', 400);

  // 讀取 link 紀錄（與 /d/[code].ts 相同來源）
  const raw = await ctx.env.LINKS.get(`link:${code}`);
  if (!raw) return text('Not Found', 404);

  type Rec = {
    code: string;
    title?: string;
    version?: string;
    bundle_id?: string;
    lang?: string;
    apk_key?: string;
    ipa_key?: string;
    owner?: string;             // ← 你的資料就是這個欄位
    uid?: string; userId?: string; ownerUid?: string;
  };

  let rec: Rec;
  try { rec = JSON.parse(raw); }
  catch { return text('Broken record', 500); }

  // 解析平台與目的地
  const p = url.searchParams.get('p'); // 'apk' | 'ios'
  let type: 'apk'|'ipa' = 'apk';
  let destination = '';

  if (p === 'apk') {
    if (!rec.apk_key) return text('APK Not Found', 404);
    destination = `https://cdn.rudownload.win/${encodeURI(rec.apk_key)}`;
    type = 'apk';
  } else if (p === 'ios' || p === 'ipa') {
    if (!rec.ipa_key) return text('IPA Not Found', 404);
    const manifest = `${url.origin}/m/${encodeURIComponent(code)}`;
    destination = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifest)}`;
    type = 'ipa';
  } else {
    return text('Missing p=apk|ios', 400);
  }

  // ★ 用你的欄位名取出擁有者 UID（先 owner，再其他可能欄位）
  const ownerUid = rec.owner || rec.uid || rec.userId || rec.ownerUid;
  if (!ownerUid) return text('Owner not found', 500);

  // 去重鍵（避免重覆扣點）
  const opId = `dl:${type === 'apk' ? 'android' : 'ios'}:${ownerUid}:${code}:${Date.now()}`;

  // 先扣點；不足就不送檔
  const deduct = await deductForOwner(ctx.env, ownerUid, type === 'apk' ? 'android' : 'ios', opId);
  if (!deduct.ok) {
    return text('The download is temporarily unavailable (insufficient points).', deduct.status || 402);
  }

  // 簡單統計（可移除）
  ctx.waitUntil(safeIncr(ctx.env.LINKS, code, type));

  // 302 轉向到真正目的地
  return new Response(null, { status: 302, headers: { Location: destination, ...noStore() } });
};

/* ---------------- helpers（本檔自足，不依賴外部 utils） ---------------- */

function text(msg: string, status = 200) {
  return new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...noStore() } });
}

function noStore() {
  return {
    'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
    pragma: 'no-cache',
  };
}

async function safeIncr(links: KVNamespace, code: string, type: 'apk'|'ipa') {
  try {
    const key = `stat:hit:${code}:${type}:${Math.floor(Date.now() / (1000 * 60 * 60))}`;
    const cur = parseInt((await links.get(key)) || '0', 10);
    await links.put(key, String(cur + 1), { expirationTtl: 60 * 60 * 24 * 7 });
  } catch {}
}
