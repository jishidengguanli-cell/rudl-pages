// functions/api/admin/users/list.ts
import { readCookie, verifySession } from "../../_lib/auth";
import { J } from "../../_lib/points"; // 只是拿共用的 J()，沒有依賴 points 資料

interface Env {
  USERS: KVNamespace;
  ADMIN_EMAILS: string;
  SESSION_SECRET: string;
}

async function isAdmin(env: Env, request: Request) {
  const sid = readCookie(request, "sid");
  const me = sid ? await verifySession(env.SESSION_SECRET, sid) : null;
  if (!me) return null;
  const wl = (env.ADMIN_EMAILS || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
  return wl.includes((me.email || "").toLowerCase()) ? me : null;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const me = await isAdmin(env, request);
  if (!me) return J({ error: "unauthorized" }, 401);

  const url = new URL(request.url);
  const limit = Math.min(50, Number(url.searchParams.get("limit") || "5") || 5); // 預設 5 筆
  const q = (url.searchParams.get("q") || "").toLowerCase();
  let cursor = url.searchParams.get("cursor") || undefined;

  const items: any[] = [];
  let next = cursor, safety = 0;

  // 掃描 user:*，直到湊到 limit 筆或列舉完
  while (items.length < limit && safety++ < 50) {
    const res = await env.USERS.list({ prefix: "user:", cursor: next, limit: 100 });
    for (const k of res.keys) {
      const uid = k.name.slice(5);
      const raw = await env.USERS.get(k.name);
      if (!raw) continue;

      try {
        const u = JSON.parse(raw);
        const row = {
          email: u.email || "",
          uid,
          role: u.role || "user",
          createdAt: u.createdAt || u.created_at || 0,
        };
        const text = `${row.email} ${row.uid} ${row.role}`.toLowerCase();
        if (!q || text.includes(q)) {
          items.push(row);
          if (items.length >= limit) break;
        }
      } catch {}
    }
    if (items.length >= limit || res.list_complete) { next = res.cursor || undefined; break; }
    next = res.cursor || undefined;
  }

  // 依建立時間 DESC
  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const hasMore = !!next;
  return J({ ok: true, items, cursor: hasMore ? next : null, list_complete: !hasMore });
};
