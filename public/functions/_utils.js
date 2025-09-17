// functions/_utils.js
export function getUid(request) {
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)uid=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : 'demo';
}
