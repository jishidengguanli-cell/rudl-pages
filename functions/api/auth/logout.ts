import { clearSessionCookie, Env } from "../_lib/auth";

export async function onRequestPost({ env }: { env: Env }) {
  const headers = new Headers();
  clearSessionCookie(headers);
  return new Response(null, { status: 204, headers });
}
