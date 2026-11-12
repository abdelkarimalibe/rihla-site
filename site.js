/* Rihla shared page script. Loaded with `defer` on every page.
   Nothing on a page depends on it: if it is blocked, the page still works.

   1. First-touch attribution. Remembers the first campaign (UTM values) that brought
      a visitor, as rihla_utm in localStorage. First touch means the first campaign
      wins: a later campaign link does not overwrite it. The homepage's list_signup
      and spot_claim events read this value. GA4 already captures session
      source/medium from the landing URL; this persists it past the first page.
   2. Click tracking. Any link or button with a data-cta attribute reports a
      cta_click event to Google Analytics, with the attribute's value as `cta`.
   3. Cookie notice. The homepage carries its own banner (#cookie-banner). On every
      other page this file shows the same notice until the visitor chooses, and stores
      the choice in the same place (rihla_consent), so one answer covers the whole site.
      If you change the wording on the homepage, change it here too.

   No name, email address or phone number is ever sent. */
(function () {
  try {
    if (!localStorage.getItem('rihla_utm')) {
      var params = new URLSearchParams(window.location.search);
      var utm = {};
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (k) {
        var v = params.get(k);
        if (v) utm[k] = v;
      });
      if (Object.keys(utm).length) {
        utm.first_touch = new Date().toISOString();
        localStorage.setItem('rihla_utm', JSON.stringify(utm));
      }
    }
  } catch (e) { /* storage unavailable, ignore */ }

  /* The first campaign as event parameters, for events that mark a new lead or account
     (the register page's sign_up uses it). Empty when no campaign brought the visitor. */
  window.rihlaFirstTouch = function () {
    try {
      var u = JSON.parse(localStorage.getItem('rihla_utm') || 'null');
      if (!u) return {};
      return {
        first_source: u.utm_source || '(none)',
        first_medium: u.utm_medium || '(none)',
        first_campaign: u.utm_campaign || '(none)'
      };
    } catch (err) { return {}; }
  };

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-cta]') : null;
    if (el && typeof gtag === 'function') gtag('event', 'cta_click', { cta: el.getAttribute('data-cta') });
  });

  if (document.getElementById('cookie-banner')) return;
  var stored = null;
  try { stored = localStorage.getItem('rihla_consent'); } catch (e) { /* storage unavailable: ask anyway */ }
  if (stored) return;

  var style = document.createElement('style');
  style.textContent =
    '#rihla-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:200;display:flex;align-items:center;gap:16px;flex-wrap:wrap;' +
      'background:#111827;border:1px solid rgba(200,148,60,.18);border-radius:12px;padding:16px 20px;box-shadow:0 12px 40px rgba(0,0,0,.45);' +
      'font-family:Manrope,sans-serif;text-align:left}' +
    '#rihla-consent p{flex:1;min-width:220px;margin:0;padding:0;font-size:13px;line-height:1.6;color:#F5EDD6;text-align:left}' +
    '#rihla-consent p a{color:#E8B85C;text-decoration:underline}' +
    '#rihla-consent div{display:flex;gap:8px;flex-shrink:0;margin:0}' +
    '#rihla-consent button{width:auto;margin:0;border-radius:10px;font-family:inherit;font-size:14px;font-weight:700;line-height:normal;' +
      'padding:13px 22px;cursor:pointer;white-space:nowrap}' +
    '#rihla-consent button[data-choice=granted]{background:#C8943C;color:#080D1A;border:1px solid #C8943C}' +
    '#rihla-consent button[data-choice=denied]{background:transparent;color:#C8943C;border:1px solid rgba(200,148,60,.5)}';
  document.head.appendChild(style);

  var box = document.createElement('div');
  box.id = 'rihla-consent';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', 'Cookie notice');
  box.setAttribute('data-nosnippet', '');
  box.innerHTML =
    '<p>We use Google Analytics to count page views and QR scans, so restaurants can see how many customers Rihla sends them. ' +
    'You can accept or decline. Read our <a href="/privacy.html">Privacy Policy</a>.</p>' +
    '<div><button type="button" data-choice="granted">Accept</button><button type="button" data-choice="denied">Decline</button></div>';
  box.addEventListener('click', function (e) {
    var choice = e.target && e.target.getAttribute ? e.target.getAttribute('data-choice') : null;
    if (!choice) return;
    try { localStorage.setItem('rihla_consent', choice); } catch (err) { /* choice applies to this page view only */ }
    if (choice === 'granted' && typeof gtag === 'function') gtag('consent', 'update', { 'analytics_storage': 'granted' });
    box.parentNode.removeChild(box);
  });
  document.body.appendChild(box);
})();
