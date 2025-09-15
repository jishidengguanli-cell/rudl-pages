import { readCookie, verifySession, Env } from "../_lib/auth";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const sid = readCookie(ctx.request, "sid");
  if (!sid) return json({ authenticated: false }, 200);
  const p = await verifySession(ctx.env.SESSION_SECRET, sid);
  if (!p) return json({ authenticated: false }, 200);
  return json({ authenticated: true, id: p.uid, email: p.email });
};
function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
