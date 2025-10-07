// functions/api/admin/tools/migrate_counters.ts
import { readCookie, verifySession } from "../../_lib/auth";
import { J } from "../../_lib/points";

interface Env {
  LINKS: KVNamespace;
  ADMIN_EMAILS: string;
  SESSION_SECRET: string;
}

async function requireAdmin(env: Env, request: Request) {
  const sid = readCookie(request, "sid");
  const me = sid ? await verifySession(env.SESSION_SECRET, sid) : null;
  if (!me) return { error: "unauthorized" as const };
  const wl = (env.ADMIN_EMAILS || "").toLowerCase().split(/[,;\s]+/).filter(Boolean);
  if (!wl.includes((me.email || "").toLowerCase())) return { error: "forbidden" as const };
  return { ok: true as const };
}

// 轉換舊鍵 → 新鍵；不符合的回傳空字串
function translate(oldKey: string): string {
  // cnt:{code}:total
  let m = oldKey.match(/^cnt:([^:]+):total$/);
  if (m) return `cnt${m[1]}total`;

  // cnt:{code}:{apk|ipa|ios}:total
  m = oldKey.match(/^cnt:([^:]+):(apk|ipa|ios):total$/);
  if (m) return `cnt${m[1]}${m[2] === "ios" ? "ipa" : m[2]}total`;

  // cnt:{code}:day:YYYYMMDD
  m = oldKey.match(/^cnt:([^:]+):day:(\d{8})$/);
  if (m) return `cnt${m[1]}day:${m[2]}`;

  // cnt:{code}:{apk|ipa|ios}:day:YYYYMMDD
  m = oldKey.match(/^cnt:([^:]+):(apk|ipa|ios):day:(\d{8})$/);
  if (m) return `cnt${m[1]}${m[2] === "ios" ? "ipa" : m[2]}day:${m[3]}`;

  return "";
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const gate = await requireAdmin(env, request);
  // @ts-ignore
  if (gate?.error) return J(gate, gate.error === "unauthorized" ? 401 : 403);

  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";

  let cursor: string | undefined = undefined;
  let total = 0, convertible = 0;
  do {
    const res = await env.LINKS.list({ prefix: "cnt:", cursor, limit: 1000 });
    for (const k of res.keys) {
      total++;
      const to = translate(k.name);
      if (to) convertible++;
    }
    cursor = res.list_complete ? undefined : (res.cursor || undefined);
  } while (cursor);

  return J({ ok: true, dry, scanned: total, convertible });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const gate = await requireAdmin(env, request);
  // @ts-ignore
  if (gate?.error) return J(gate, gate.error === "unauthorized" ? 401 : 403);

  const url = new URL(request.url);
  const del = url.searchParams.get("delete") === "1";

  let cursor: string | undefined = undefined;
  let migrated = 0, updated = 0, deleted = 0, skipped = 0;

  do {
    const res = await env.LINKS.list({ prefix: "cnt:", cursor, limit: 1000 });
    for (const k of res.keys) {
      const from = k.name;
      const to = translate(from);
      if (!to) { skipped++; continue; }

      const ov = await env.LINKS.get(from);
      if (ov == null) continue;
      const oldNum = Number(ov) || 0;

      const nv = await env.LINKS.get(to);
      const newNum = Number(nv || "0") || 0;

      if (oldNum > newNum) {
        await env.LINKS.put(to, String(oldNum));
        updated++;
      }
      migrated++;

      if (del) { await env.LINKS.delete(from); deleted++; }
    }
    cursor = res.list_complete ? undefined : (res.cursor || undefined);
  } while (cursor);

  return J({ ok: true, migrated, updated, deleted, skipped, deleted_old_keys: del });
};
