import { hashPassword, signSession, setSessionCookie, Env } from "../_lib/auth";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const { USERS, SESSION_SECRET, SESSION_DAYS } = ctx.env;
    if (!USERS) throw new Error("USERS binding missing");
    if (!SESSION_SECRET) throw new Error("SESSION_SECRET missing");

    const { email, password } = await ctx.request.json<any>().catch(() => ({}));
    if (!email || !password) return json({ error: "email and password required" }, 400);

    const em = String(email).trim().toLowerCase();
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(em)) return json({ error: "invalid email" }, 400);
    if (String(password).length < 8) return json({ error: "password too short" }, 400);

    const existingUid = await USERS.get(`email:${em}`);
    if (existingUid) return json({ error: "email already registered" }, 409);

    const uid = crypto.randomUUID();
    const pwHash = await hashPassword(String(password));

    await USERS.put(`user:${uid}`, JSON.stringify({ id: uid, email: em, pw: pwHash, createdAt: Date.now() }));
    await USERS.put(`email:${em}`, uid);

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
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "internal", detail: String(e?.message || e) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
};
function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
