// functions/api/links/list.ts
import { readCookie, verifySession, type AuthEnv } from "../_lib/auth";

export interface Env extends AuthEnv {
  LINKS: KVNamespace;
}

function json(s:number, d:any){
  return new Response(JSON.stringify(d),{
    status:s, headers:{'content-type':'application/json; charset=utf-8'}
  });
}

export const onRequestGet: PagesFunction<Env> = async ({request, env})=>{
  try{
    const linksKV: KVNamespace | undefined =
      (env as any).LINKS || (env as any).links;
    if (!linksKV || typeof (linksKV as any).get !== "function") {
      return json(500, { error:"config", detail:"KV binding LINKS missing" });
    }

    const sid = readCookie(request.headers.get('cookie') || "", "sid");
    const sess = await verifySession(env, sid).catch(()=>null);
    if (!sess) return json(401, { error:"unauthorized" });

    // 先用索引
    const idxKey = `user:${sess.user.id}`;
    const idx = (await linksKV.get(idxKey)) || "";
    const codes = idx.split(/\s+/).filter(Boolean);

    let items:any[] = [];
    if (codes.length) {
      const pairs = await Promise.all(
        codes.map(c => linksKV.get(`link:${c}`))
      );
      items = pairs
        .map(v => { try { return v ? JSON.parse(v) : null; } catch { return null; } })
        .filter(Boolean);
    } else {
      // 沒索引就掃描（較慢，但能保底）
      const list = await linksKV.list({ prefix: "link:" });
      if (list.keys.length) {
        const values = await Promise.all(list.keys.map(k => linksKV.get(k.name)));
        items = values
          .map(v => { try { return v ? JSON.parse(v) : null; } catch { return null; } })
          .filter(Boolean)
          .filter((x:any) => x.owner === sess.user.id);
      }
    }

    // 按建立時間新到舊
    items.sort((a:any,b:any)=> (b.createdAt||0)-(a.createdAt||0));

    return json(200, { ok:true, items });
  }catch(e:any){
    return json(500, { error:"internal", detail:e?.message || String(e) });
  }
}
