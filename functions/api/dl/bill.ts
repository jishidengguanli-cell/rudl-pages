// functions/api/dl/bill.ts
import { J, spendOncePerMinute, incLinkCounters, COST_PER_DOWNLOAD } from "../_lib/points";

interface Env {
  LINKS: KVNamespace;
  POINTS: KVNamespace;
  USERS: KVNamespace;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  let body: any = {};
  try { body = await request.json(); } catch {}
  const code = String(body.code || "").trim();
  const os: "apk" | "ipa" = (body.os === "ipa" ? "ipa" : "apk");

  if (!code) return J({ error: "code required" }, 400);

  const raw = await env.LINKS.get(`link:${code}`);
  if (!raw) return J({ error: "not found" }, 404);

  let rec: any = {};
  try { rec = JSON.parse(raw); } catch { return J({ error: "broken record" }, 500); }

  const ownerUid = rec.owner || rec.uid;
  if (!ownerUid) return J({ error: "owner missing" }, 400);

  const cost = COST_PER_DOWNLOAD[os] ?? 0;

  // 扣點（含 1 分鐘冷卻）
  const r = await spendOncePerMinute(env as any, ownerUid, cost, { code, os });
  if ("error" in r && r.error === "insufficient") return J({ error: "INSUFFICIENT_POINTS" }, 402);
  if ("error" in r) return J({ error: r.error }, 400);

  // 只有「第一次（deducted=true）」才遞增計數；冷卻期內不重複計
  if (r.deducted) {
    await incLinkCounters(env as any, code, os);
  }

  return J({ ok: true, balance: r.balance });
};
