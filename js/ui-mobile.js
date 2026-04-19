/**
 * Shell móvil: drawer + sincronización de la barra superior.
 * Solo UI — no toca Firebase, cálculos ni PDF.
 */
(function () {
  var DRAWER_CLASS = 'drawer-open';
  var mq = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 768px)') : { matches: false, addEventListener: function () {} };

  function isMobileNav() {
    return mq.matches;
  }

  function setDrawerOpen(open) {
    var app = document.getElementById('app');
    var btn = document.getElementById('btn-mobile-menu');
    var overlay = document.getElementById('drawer-overlay');
    if (!app || !app.classList.contains('active')) return;
    if (open) {
      app.classList.add(DRAWER_CLASS);
      document.body.classList.add(DRAWER_CLASS);
      document.body.style.overflow = 'hidden';
      if (btn) btn.setAttribute('aria-expanded', 'true');
      if (overlay) overlay.setAttribute('aria-hidden', 'false');
    } else {
      app.classList.remove(DRAWER_CLASS);
      document.body.classList.remove(DRAWER_CLASS);
      document.body.style.overflow = '';
      if (btn) btn.setAttribute('aria-expanded', 'false');
      if (overlay) overlay.setAttribute('aria-hidden', 'true');
    }
  }

  function toggleDrawer() {
    var app = document.getElementById('app');
    if (!app) return;
    setDrawerOpen(!app.classList.contains(DRAWER_CLASS));
  }

  function syncMobileTopbar() {
    var t = document.getElementById('tb-title');
    var s = document.getElementById('tb-sub');
    var d = document.getElementById('tb-date');
    var mt = document.getElementById('mobile-tb-title');
    var ms = document.getElementById('mobile-tb-sub');
    var md = document.getElementById('mobile-tb-date');
    if (mt && t) mt.textContent = t.textContent || '—';
    if (ms && s) ms.textContent = s.textContent || '';
    if (md && d) md.textContent = d.textContent || '';
  }

  function initDrawer() {
    var btn = document.getElementById('btn-mobile-menu');
    var overlay = document.getElementById('drawer-overlay');
    if (btn && !btn.dataset.uiBound) {
      btn.dataset.uiBound = '1';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        toggleDrawer();
      });
    }
    if (overlay && !overlay.dataset.uiBound) {
      overlay.dataset.uiBound = '1';
      overlay.addEventListener('click', function () {
        setDrawerOpen(false);
      });
    }
    if (!document.documentElement.dataset.drawerEsc) {
      document.documentElement.dataset.drawerEsc = '1';
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') setDrawerOpen(false);
      });
    }
    var onMq = function () {
      if (!mq.matches) setDrawerOpen(false);
    };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onMq);
    else if (typeof mq.addListener === 'function') mq.addListener(onMq);
    var sb = document.getElementById('sb');
    if (sb && !sb.dataset.uiNavClose) {
      sb.dataset.uiNavClose = '1';
      sb.addEventListener(
        'click',
        function (e) {
          if (!isMobileNav()) return;
          if (e.target.closest('.nav-it, .btn-logout')) setDrawerOpen(false);
        },
        true
      );
    }
  }

  function initTopbarSync() {
    var t = document.getElementById('tb-title');
    var s = document.getElementById('tb-sub');
    var d = document.getElementById('tb-date');
    if (!t && !s && !d) return;
    var obs = new MutationObserver(syncMobileTopbar);
    [t, s, d].forEach(function (el) {
      if (el) obs.observe(el, { characterData: true, subtree: true, childList: true });
    });
    syncMobileTopbar();
  }

  function boot() {
    initDrawer();
    initTopbarSync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
