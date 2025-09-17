// public/js/points-badge.js
(function () {
  // 確保每個瀏覽器有一個 uid（與 /recharge.html 相同邏輯）
  function ensureUid() {
    if (document.cookie.split('; ').some(v => v.startsWith('uid='))) return;
    const uid = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    document.cookie = `uid=${encodeURIComponent(uid)}; Path=/; Max-Age=${60*60*24*365}; SameSite=Lax`;
  }

  async function fetchPoints() {
    const r = await fetch('/api/me/points', { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'fetch points failed');
    return j.points ?? 0;
  }

  async function mountPointsBadge(opts) {
    ensureUid();
    const { el = '#points-badge', refreshMs = 30000 } = (opts || {});
    const node = (typeof el === 'string') ? document.querySelector(el) : el;
    if (!node) return;

    async function render() {
      try {
        const pts = await fetchPoints();
        node.textContent = `${pts} pts`;
      } catch {
        node.textContent = '-- pts';
      }
    }

    await render();

    // 自動刷新（每 30s）＋ 切回分頁就刷新 ＋ 支援跨頁廣播
    const timer = setInterval(render, refreshMs);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
    window.addEventListener('points:updated', render);
    window.addEventListener('storage', (e) => { if (e.key === 'points:updated') render(); });

    // 提供全域 API：PointsUI.refresh()
    window.PointsUI = Object.assign(window.PointsUI || {}, {
      refresh: () => { render(); },
      mountPointsBadge
    });
  }

  // 自動掛載（若頁面上有 #points-badge）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountPointsBadge({ el: '#points-badge' }));
  } else {
    mountPointsBadge({ el: '#points-badge' });
  }
})();
