export const onRequestGet: PagesFunction = async (ctx) => {
  const keys = Object.keys(ctx.env);
  const hasUsers = "USERS" in ctx.env && typeof (ctx.env as any).USERS?.get === "function";
  const hasSecret = "SESSION_SECRET" in ctx.env;
  return new Response(JSON.stringify({ keys, hasUsers, hasSecret }), {
    headers: { "content-type": "application/json" },
  });
};
