// public/js/points-badge.js
(function () {
  function ensureUid() {
    if (document.cookie.split('; ').some(v => v.startsWith('uid='))) return;
    const uid = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    document.cookie = `uid=${encodeURIComponent(uid)}; Path=/; Max-Age=${60*60*24*365}; SameSite=Lax`;
  }

  async function fetchPoints() {
    const r = await fetch('/api/me/points', { cache: 'no-store' });
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { console.error('Bad JSON from /api/me/points:', text); throw new Error('Bad JSON'); }
    if (!r.ok) throw new Error(j?.error || 'fetch points failed');
    return j.points ?? 0;
  }

  async function mountPointsBadge(opts) {
    ensureUid();
    const { el = '#points-badge', refreshMs = 30000 } = (opts || {});
    const node = (typeof el === 'string') ? document.querySelector(el) : el;
    if (!node) return;

    async function render() {
      try { node.textContent = `${await fetchPoints()} pts`; }
      catch { node.textContent = '-- pts'; }
    }

    await render();
    const t = setInterval(render, refreshMs);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
    window.addEventListener('points:updated', render);
    window.addEventListener('storage', (e) => { if (e.key === 'points:updated') render(); });

    // 提供全域 API
    window.PointsUI = Object.assign(window.PointsUI || {}, { refresh: render, mountPointsBadge });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mountPointsBadge({ el: '#points-badge' }));
  } else {
    mountPointsBadge({ el: '#points-badge' });
  }
})();
