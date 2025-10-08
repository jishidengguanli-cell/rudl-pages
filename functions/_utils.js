// functions/_utils.js
import { readCookie, verifySession } from "./api/_lib/auth";

export async function getUid(request, env) {
  let uid = "";

  // Prefer the signed session cookie
  try {
    if (env && env.SESSION_SECRET) {
      const sid = readCookie(request, "sid");
      if (sid) {
        const payload = await verifySession(env.SESSION_SECRET, sid);
        if (payload?.uid) return payload.uid;
      }
    }
  } catch {
    uid = "";
  }

  // Legacy fallback: plain uid cookie (kept for backwards compatibility)
  try {
    const cookie = request.headers.get("cookie") || "";
    const m = cookie.match(/(?:^|;\s*)uid=([^;]+)/);
    if (m) uid = decodeURIComponent(m[1]);
  } catch {
    uid = "";
  }

  return uid;
}
