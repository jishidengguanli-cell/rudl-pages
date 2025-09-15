import { hashPassword, signSession, setSessionCookie, Env } from "../_lib/auth";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { USERS, SESSION_SECRET, SESSION_DAYS } = ctx.env;
  const { email, password } = await ctx.request.json<any>().catch(() => ({}));

  if (!email || !password) return json({ error: "email and password required" }, 400);
  const em = String(email).trim().toLowerCase();
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(em)) return json({ error: "invalid email" }, 400);
  if (String(password).length < 8) return json({ error: "password too short" }, 400);

  // 已存在？
  const existingUid = await USERS.get(`email:${em}`);
  if (existingUid) return json({ error: "email already registered" }, 409);

  const uid = crypto.randomUUID();
  const pwHash = await hashPassword(String(password));

  await USERS.put(`user:${uid}`, JSON.stringify({ id: uid, email: em, pw: pwHash, createdAt: Date.now() }));
  await USERS.put(`email:${em}`, uid);

  // 簽 session
  const days = Number(SESSION_DAYS || "7") || 7;
  const exp = Math.floor(Date.now() / 1000) + days * 24 * 3600;
  const token = await signSession(SESSION_SECRET, { uid, email: em, exp });
  return new Response(JSON.stringify({ id: uid, email: em }), {
    status: 201,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": setSessionCookie(token, days),
    },
  });
};

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
