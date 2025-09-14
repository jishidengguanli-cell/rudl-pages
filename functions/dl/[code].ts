export interface Env { FILES: KVNamespace }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const code = ctx.params.code as string;
  const meta = await ctx.env.FILES.get(`file:${code}`, { type: "json" }) as any | null;
  if (!meta) return new Response("Not found", { status: 404 });

  const ua = ctx.request.headers.get("user-agent") || "";
  const isAndroid = /Android/i.test(ua);
  const target =
    (isAndroid && meta.apk_url) ? meta.apk_url :
    (meta.ipa_url ? meta.ipa_url : meta.apk_url);

  if (!target) return new Response("File missing", { status: 404 });
  // TODO: 可在這裡做下載記錄 / 速率限制 / 風控
  return Response.redirect(target, 302);
};
