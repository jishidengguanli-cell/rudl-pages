import { verifyPassword, signSession, setSessionCookie, Env } from "../_lib/auth";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { USERS, SESSION_SECRET, SESSION_DAYS } = ctx.env;
  const { email, password } = await ctx.request.json<any>().catch(() => ({}));
  if (!email || !password) return json({ error: "email and password required" }, 400);
  const em = String(email).trim().toLowerCase();

  const uid = await USERS.get(`email:${em}`);
  if (!uid) return json({ error: "invalid credentials" }, 401);
  const raw = await USERS.get(`user:${uid}`);
  if (!raw) return json({ error: "invalid credentials" }, 401);
  const user = JSON.parse(raw);

  const ok = await verifyPassword(String(password), user.pw);
  if (!ok) return json({ error: "invalid credentials" }, 401);

  const days = Number(SESSION_DAYS || "7") || 7;
  const exp = Math.floor(Date.now() / 1000) + days * 24 * 3600;
  const token = await signSession(SESSION_SECRET, { uid, email: em, exp });

  return new Response(JSON.stringify({ id: uid, email: em }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "set-cookie": setSessionCookie(token, days),
    },
  });
};

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
