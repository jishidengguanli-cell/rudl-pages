export const onRequestGet: PagesFunction = async (ctx) => {
  const code = ctx.params.code as string;
  // 先用 stub：實作時你會從 KV/DB 取出固定 CDN 檔案 URL
  const cdnUrl = `https://cdn.rudownload.win/android/App-${code}.apk`;
  return Response.redirect(cdnUrl, 302);
};
