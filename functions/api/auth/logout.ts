import { clearSessionCookie, Env } from "../_lib/auth";

export const onRequestPost: PagesFunction<Env> = async () => {
  return new Response("", {
    status: 204,
    headers: { "set-cookie": clearSessionCookie(), "cache-control": "no-store" },
  });
};
