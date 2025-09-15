// public/app.js —— 小小的前端工具與登入狀態管理
async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: "Bad JSON", raw: text }; }
  return { ok: res.ok, status: res.status, data, res };
}
async function getJSON(url) {
  const res = await fetch(url);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: "Bad JSON", raw: text }; }
  return { ok: res.ok, status: res.status, data, res };
}
const Auth = {
  async me() { const { data } = await getJSON("/api/auth/me"); return data; },
  async require() {
    const me = await this.me();
    if (!me.authenticated) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = "/login.html?next=" + next;
      throw new Error("unauthenticated");
    }
    return me;
  },
  async logout() { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/"; },
};
function qs(id) { return document.getElementById(id); }
function setBtnLoading(btn, on) {
  if (!btn) return;
  if (!btn.dataset.label) btn.dataset.label = btn.textContent;
  btn.disabled = on;
  btn.textContent = on ? "請稍候…" : btn.dataset.label;
}
