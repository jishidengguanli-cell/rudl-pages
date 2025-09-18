import { readCookie, verifySession } from '../_lib/auth'

export const onRequestGet = async (ctx: any) => {
  const sid = readCookie(ctx.request, 'sid')
  if (!sid) return json({ authenticated: false })

  let p: any = null
  try { p = await verifySession(ctx.env.SESSION_SECRET, sid) }
  catch { /* ignore */ }

  if (!p) return json({ authenticated: false })
  return json({ authenticated: true, id: p.uid, email: p.email })
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
