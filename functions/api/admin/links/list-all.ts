// functions/api/admin/links/list-all.ts
import { readCookie, verifySession } from "../../_lib/auth";
import { J, readLinkCounters, Env as PEnv } from "../../_lib/points";

interface Env extends PEnv {
  LINKS: KVNamespace;
  USERS: KVNamespace;
  ADMIN_EMAILS: string;
}

async function isAdmin(env: Env, request: Request) {
  const sid = readCookie(request, "sid");
  const me = sid ? await verifySession(env.SESSION_SECRET, sid) : null;
  const wl = (env.ADMIN_EMAILS || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
  return me && wl.includes((me.email || "").toLowerCase());
}
async function uidToEmail(env: Env, uid: string) {
  const raw = await env.USERS.get(`user:${uid}`);
  if (!raw) return "";
  try { return (JSON.parse(raw).email || "") as string; } catch { return ""; }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (!(await isAdmin(env, request))) return J({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const limit = Math.min(50, Number(url.searchParams.get("limit") || "5") || 5);
  const q = (url.searchParams.get("q") || "").toLowerCase();
  let cursor = url.searchParams.get("cursor") || undefined;

  const items: any[] = [];
  let next = cursor, safety = 0;

  while (items.length < limit && safety++ < 50) {
    const res = await env.LINKS.list({ prefix: "link:", cursor: next || undefined, limit: 100 });
    for (const k of res.keys) {
      const code = k.name.slice(5);
      const raw = await env.LINKS.get(k.name);
      if (!raw) continue;
      try {
        const rec = JSON.parse(raw);
        const ownerUid = rec.owner || rec.uid || "";
        const ownerEmail = ownerUid ? await uidToEmail(env as any, ownerUid) : "";
        const counters = await readLinkCounters(env as any, code);
        const row = {
          code,
          owner: ownerEmail || ownerUid,
          platform: rec.platform || rec.type || "",
          filename: rec.filename || rec.name || "",
          createdAt: rec.createdAt || rec.created_at || 0,
          today: counters.today,
          total: counters.total,
        };
        const text = `${row.code} ${row.owner} ${row.platform} ${row.filename}`.toLowerCase();
        if (!q || text.includes(q)) {
          items.push(row);
          if (items.length >= limit) break;
        }
      } catch {}
    }
    if (items.length >= limit || res.list_complete) { next = res.cursor || undefined; break; }
    next = res.cursor || undefined;
  }

  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // 建立時間 DESC
  return J({ ok: true, items, cursor: next });
};
