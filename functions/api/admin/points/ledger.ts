// functions/api/admin/points/ledger.ts
import { readCookie, verifySession } from "../../_lib/auth";
import { J, Env as PEnv } from "../../_lib/points";

interface Env extends PEnv {
  POINTS: KVNamespace;
  ADMIN_EMAILS: string;
}

async function isAdmin(env: Env, request: Request) {
  const sid = readCookie(request, "sid");
  const me = sid ? await verifySession(env.SESSION_SECRET, sid) : null;
  const wl = (env.ADMIN_EMAILS || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
  return me && wl.includes((me.email || "").toLowerCase());
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (!(await isAdmin(env, request))) return J({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const uid = (url.searchParams.get("uid") || "").trim();
  const limit = Math.min(20, Number(url.searchParams.get("limit") || "5") || 5);
  const q = (url.searchParams.get("q") || "").toLowerCase();
  let cursor = url.searchParams.get("cursor") || undefined;

  if (!uid) return J({ error: "uid required" }, 400);

  const items: any[] = [];
  let next = cursor, safety = 0;

  while (items.length < limit && safety++ < 50) {
    const res = await env.POINTS.list({ prefix: `ptlog:${uid}:`, cursor: next || undefined, limit: 100 });
    for (const k of res.keys) {
      const raw = await env.POINTS.get(k.name);
      if (!raw) continue;
      try {
        const e = JSON.parse(raw);
        const text = JSON.stringify(e).toLowerCase();
        if (!q || text.includes(q)) items.push(e);
        if (items.length >= limit) break;
      } catch {}
    }
    if (items.length >= limit || res.list_complete) { next = res.cursor || undefined; break; }
    next = res.cursor || undefined;
  }

  items.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return J({ ok: true, items, cursor: next });
};
