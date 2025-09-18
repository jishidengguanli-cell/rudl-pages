// functions/api/dl/bill.ts
import { J, spendOncePerMinute } from "../_lib/points";

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
  const os   = (body.os === "ipa" ? "ipa" : "apk") as "apk"|"ipa";

  if (!code) return J({ error: "code required" }, 400);

  const raw = await env.LINKS.get(`link:${code}`);
  if (!raw) return J({ error: "not found" }, 404);

  let rec: any = {};
  try { rec = JSON.parse(raw); } catch { return J({ error: "broken record" }, 500); }

  const ownerUid = rec.owner || rec.uid;
  if (!ownerUid) return J({ error: "owner missing" }, 400);

  // 成本：Android=3、iOS=5（你在前面需求已確認）
  const cost = os === "apk" ? 3 : 5;

  const r = await spendOncePerMinute(env as any, ownerUid, cost, { code, os });
  if ("error" in r && r.error === "insufficient") {
    return J({ error: "INSUFFICIENT_POINTS" }, 402);
  }
  if ("error" in r) return J({ error: r.error }, 400);

  return J({ ok: true, balance: r.balance });
};
