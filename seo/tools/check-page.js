#!/usr/bin/env node
/*
 * Behaviour checks every page in the SEO pass must pass, run against the local server.
 *
 *   node seo/tools/check-page.js http://127.0.0.1:8765/demo.html
 *
 * Checks: Google tag and consent defaults, stored consent honoured, first-touch campaign
 * saved by /site.js, a cta_click for every [data-cta] element, structured data parses and
 * agrees with the title and description, share tags agree, internal links resolve,
 * no JavaScript errors, no sideways scroll on a phone. Analytics requests are blocked.
 * Exits 1 if anything fails.
 */
const { chromium } = require('playwright');

const url = process.argv[2];
// --session: pretend an owner is signed in (the stand-in library reads window.__stubSession).
const SESSION = process.argv.includes('--session');
if (!url) { console.error('usage: node check-page.js <url> [--session]'); process.exit(2); }
const origin = new URL(url).origin;
const results = [];
const ok = (name, cond, extra) => results.push({ name, pass: !!cond, extra });
const layer = (page) => page.evaluate(() => (window.dataLayer || []).map((a) => Array.from(a)));
const BLOCK = /google-analytics|googletagmanager|doubleclick/;
const STUB = require('fs').readFileSync(require('path').join(__dirname, 'supabase-stub.js'), 'utf8');
// Blocks analytics and answers the Supabase CDN with a local stand-in.
const handle = (r) => {
  const u = r.request().url();
  if (BLOCK.test(u)) return r.abort();
  if (/cdn\.jsdelivr\.net\/npm\/@supabase/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB });
  return r.continue();
};

(async () => {
  const launch = { args: ['--no-sandbox'] };
  if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' };
  const browser = await chromium.launch(launch);
  if (SESSION) {
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (o) => {
      const cx = await newContext(o);
      await cx.addInitScript(() => { window.__stubSession = { user: { email: 'owner@example.com', user_metadata: { restaurant_name: 'Test Kitchen' } } }; });
      return cx;
    };
  }
  const errors = [];

  // ── A: first visit, arriving from a campaign link ─────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.route('**/*', handle);
  page.on('pageerror', (e) => errors.push(e.message));
  const sep = url.includes('?') ? '&' : '?';
  await page.goto(url + sep + 'utm_source=check&utm_medium=email&utm_campaign=first', { waitUntil: 'load' });
  let dl = await layer(page);
  const tagSrc = await page.evaluate(() => (document.querySelector('script[src*="googletagmanager.com/gtag/js"]') || {}).src || null);
  ok('Google tag is on the page', tagSrc && /id=G-1235J90MCS/.test(tagSrc), tagSrc);
  const def = dl.find((e) => e[0] === 'consent' && e[1] === 'default');
  ok('consent defaults: all four signals denied', def && ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization'].every((k) => def[2][k] === 'denied'), def);
  ok('config comes after the consent default', dl.findIndex((e) => e[0] === 'config') > dl.findIndex((e) => e[0] === 'consent'));
  // A sign-in link from Supabase puts session tokens after "#". They must not reach Analytics.
  await page.goto(url + sep + 'utm_source=check#access_token=SECRET&refresh_token=SECRET2&type=recovery', { waitUntil: 'load' });
  const cfg = (await layer(page)).find((e) => e[0] === 'config');
  ok('Analytics never gets what follows "#" in the address', cfg && cfg[2] && typeof cfg[2].page_location === 'string' && !cfg[2].page_location.includes('#') && !JSON.stringify(await layer(page)).includes('SECRET') && cfg[2].page_location.includes('utm_source=check'), cfg);
  await page.evaluate(() => localStorage.removeItem('rihla_utm'));
  await page.goto(url + sep + 'utm_source=check&utm_medium=email&utm_campaign=first', { waitUntil: 'load' });
  dl = await layer(page);
  ok('no consent update without a stored choice', !dl.some((e) => e[0] === 'consent' && e[1] === 'update'));
  let utm = await page.evaluate(() => JSON.parse(localStorage.getItem('rihla_utm') || 'null'));
  ok('first-touch campaign saved by /site.js', utm && utm.utm_source === 'check' && utm.utm_campaign === 'first', utm);

  await page.evaluate(() => localStorage.setItem('rihla_consent', 'granted'));
  await page.goto(url + sep + 'utm_source=later&utm_medium=social&utm_campaign=second', { waitUntil: 'load' });
  dl = await layer(page);
  const upd = dl.findIndex((e) => e[0] === 'consent' && e[1] === 'update' && e[2].analytics_storage === 'granted');
  ok('stored consent is honoured before config', upd > -1 && upd < dl.findIndex((e) => e[0] === 'config'));
  utm = await page.evaluate(() => JSON.parse(localStorage.getItem('rihla_utm') || 'null'));
  ok('later campaign does not overwrite first touch', utm && utm.utm_source === 'check', utm);

  // ── every data-cta element reports a cta_click ───────────────────────────
  const ctas = await page.evaluate(() => Array.from(document.querySelectorAll('[data-cta]')).map((el) => el.getAttribute('data-cta')));
  ok('page has data-cta elements, all named uniquely', ctas.length > 0 && new Set(ctas).size === ctas.length, ctas);
  await page.evaluate(() => document.addEventListener('click', (e) => { if (e.target.closest('a')) e.preventDefault(); }, true));
  // A log-out link really logs out and leaves the page, so it is exercised in the page's own test.
  const clickable = ctas.filter((n) => !/_logout$/.test(n));
  for (const name of clickable) {
    await page.evaluate((n) => document.querySelector('[data-cta="' + n + '"]').click(), name);
  }
  dl = await layer(page);
  const clicked = dl.filter((e) => e[0] === 'event' && e[1] === 'cta_click').map((e) => e[2].cta);
  ok('cta_click fires for each: ' + clickable.join(', '), clickable.every((c) => clicked.includes(c)) && clicked.length === clickable.length, clicked);

  // ── head: structured data and share tags agree with the title and description ──
  const head = await page.evaluate(() => {
    const m = (sel, a = 'content') => { const el = document.querySelector(sel); return el ? el.getAttribute(a) : null; };
    let ld = null, ldError = null;
    const s = document.querySelector('script[type="application/ld+json"]');
    if (s) { try { ld = JSON.parse(s.textContent); } catch (e) { ldError = e.message; } }
    return {
      title: document.title, desc: m('meta[name=description]'), canonical: m('link[rel=canonical]', 'href'),
      robots: m('meta[name=robots]'), lang: document.documentElement.lang,
      ogTitle: m('meta[property="og:title"]'), ogDesc: m('meta[property="og:description"]'), ogUrl: m('meta[property="og:url"]'),
      ogImage: m('meta[property="og:image"]'), twCard: m('meta[name="twitter:card"]'), twDesc: m('meta[name="twitter:description"]'),
      icons: Array.from(document.querySelectorAll('link[rel~=icon], link[rel=apple-touch-icon]')).map((l) => l.getAttribute('href')),
      ld, ldError, h1: Array.from(document.querySelectorAll('h1')).map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  const noindex = /noindex/.test(head.robots || '');
  ok('lang is en-US', head.lang === 'en-US', head.lang);
  ok('exactly one H1', head.h1.length === 1, head.h1);
  if (noindex) {
    // Kept out of search on purpose, so lengths do not matter: a title and a description must exist.
    ok('noindex page has a title and a description', head.title.length > 0 && (head.desc || '').length > 0);
  } else {
    ok('title 30 to 60 characters', head.title.length >= 30 && head.title.length <= 60, head.title.length + ': ' + head.title);
    ok('description 110 to 158 characters', head.desc && head.desc.length >= 110 && head.desc.length <= 158, (head.desc || '').length);
  }
  ok('canonical points at this page on the production host', head.canonical === 'https://rihla-website-self.vercel.app' + new URL(url).pathname.replace(/\/index\.html$/, '/'), head.canonical);
  ok('three icon links', head.icons.length === 3, head.icons);
  if (!noindex) {
    ok('share tags present and equal to title/description', head.ogTitle && head.ogDesc === head.desc && head.twDesc === head.desc && head.ogUrl === head.canonical && /og-image\.png$/.test(head.ogImage || '') && head.twCard === 'summary_large_image', head);
    ok('structured data parses', head.ld && !head.ldError, head.ldError);
    const wp = head.ld && (head.ld['@graph'] || []).find((n) => n['@type'] === 'WebPage');
    ok('WebPage name/description/url match the page', wp && wp.name === head.title && wp.description === head.desc && wp.url === head.canonical, wp);
  }

  // ── internal links resolve ───────────────────────────────────────────────
  const links = await page.evaluate(() => Array.from(new Set(Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')).filter((h) => h.startsWith('/')))));
  const broken = [];
  for (const h of links) {
    const res = await page.request.get(origin + h.split('#')[0]);
    if (res.status() !== 200) broken.push(h + ' -> ' + res.status());
  }
  ok('internal links resolve (' + links.length + ')', broken.length === 0, broken);
  await ctx.close();

  // ── B: phone, storage blocked ────────────────────────────────────────────
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await ctx2.newPage();
  await p2.route('**/*', handle);
  p2.on('pageerror', (e) => errors.push('storage-blocked: ' + e.message));
  await p2.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
  await p2.goto(url, { waitUntil: 'load' });
  ok('no sideways scroll on a phone', (await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0);
  await ctx2.close();

  // ── C: cookie notice (pages without their own banner get one from /site.js) ──
  for (const choice of ['granted', 'denied']) {
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p3 = await c3.newPage();
    await p3.route('**/*', handle);
    p3.on('pageerror', (e) => errors.push('notice: ' + e.message));
    await p3.goto(url, { waitUntil: 'load' });
    const own = await p3.evaluate(() => !!document.getElementById('cookie-banner'));
    const sel = own ? '#cookie-banner' : '#rihla-consent';
    const btn = own ? (choice === 'granted' ? '#cookie-accept' : '#cookie-decline') : '#rihla-consent button[data-choice=' + choice + ']';
    ok('cookie notice shown on a first visit', await p3.locator(sel).isVisible());
    await p3.click(btn);
    const after = await p3.evaluate(() => ({ stored: localStorage.getItem('rihla_consent'), dl: (window.dataLayer || []).map((a) => Array.from(a)) }));
    const updated = after.dl.some((e) => e[0] === 'consent' && e[1] === 'update' && e[2].analytics_storage === 'granted');
    ok('choosing ' + choice + ' is stored' + (choice === 'granted' ? ' and grants analytics' : ' and grants nothing'), after.stored === choice && updated === (choice === 'granted'), after.stored);
    ok('notice gone after choosing', !(await p3.locator(sel).isVisible()));
    await p3.reload({ waitUntil: 'load' });
    ok('notice stays away on the next page view', !(await p3.locator(sel).isVisible()));
    await c3.close();
  }

  ok('no JavaScript errors (also with storage blocked)', errors.length === 0, errors);
  await browser.close();
  let failed = 0;
  for (const r of results) { if (!r.pass) failed++; console.log((r.pass ? 'PASS  ' : 'FAIL  ') + r.name + (r.pass ? '' : '  -> ' + JSON.stringify(r.extra))); }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
