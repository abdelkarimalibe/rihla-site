#!/usr/bin/env node
/*
 * On-page SEO audit of one page, rendered in headless Chromium.
 *
 *   node seo/tools/audit.js <url> <out-dir> [label]
 *
 * Writes <out-dir>/<label>.json plus mobile and desktop screenshots.
 * Analytics hits are blocked, so an audit never adds traffic to GA4.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [url, outDir, label = 'audit'] = process.argv.slice(2);
if (!url || !outDir) {
  console.error('usage: node audit.js <url> <out-dir> [label]');
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

const ANALYTICS = /(google-analytics\.com|analytics\.google\.com|doubleclick\.net)/;

async function run(viewport, name, isMobile) {
  const launch = { args: ['--no-sandbox'] };
  if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' };
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({
    viewport, deviceScaleFactor: 1, isMobile, hasTouch: isMobile,
    userAgent: isMobile
      ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
      : undefined,
  });
  const page = await context.newPage();
  const requests = [];
  const consoleErrors = [];
  const blockedAnalytics = [];
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (ANALYTICS.test(u)) { blockedAnalytics.push(u); return route.abort(); }
    return route.continue();
  });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('requestfinished', async (req) => {
    try {
      const res = await req.response();
      const sizes = await req.sizes().catch(() => null);
      requests.push({
        url: req.url(), type: req.resourceType(), status: res ? res.status() : null,
        bytes: sizes ? sizes.responseBodySize + sizes.responseHeadersSize : null,
      });
    } catch (_) {}
  });
  page.on('requestfailed', (req) => {
    requests.push({ url: req.url(), type: req.resourceType(), status: 'FAILED', failure: (req.failure() || {}).errorText });
  });

  await page.addInitScript(() => {
    window.__seo = { lcp: null, cls: 0 };
    try {
      new PerformanceObserver((list) => {
        const e = list.getEntries().pop();
        window.__seo.lcp = {
          time: Math.round(e.startTime), size: e.size,
          tag: e.element ? e.element.tagName : null,
          cls: e.element ? e.element.className : null,
          text: e.element ? (e.element.textContent || '').trim().slice(0, 80) : null,
        };
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__seo.cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (_) {}
  });

  const response = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(1500);

  const data = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const qa = (s) => Array.from(document.querySelectorAll(s));
    const attr = (s, a) => (q(s) ? q(s).getAttribute(a) : null);
    const visible = (el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const meta = {};
    qa('meta[name], meta[property]').forEach((m) => {
      meta[m.getAttribute('name') || m.getAttribute('property')] = m.getAttribute('content');
    });
    const headings = qa('h1,h2,h3,h4,h5,h6').map((h) => ({
      level: h.tagName, text: h.textContent.replace(/\s+/g, ' ').trim(), visible: visible(h),
    }));
    const links = qa('a[href]').map((a) => ({
      href: a.getAttribute('href'), text: a.textContent.replace(/\s+/g, ' ').trim(),
      rel: a.getAttribute('rel'), target: a.getAttribute('target'), visible: visible(a),
      w: Math.round(a.getBoundingClientRect().width), h: Math.round(a.getBoundingClientRect().height),
    }));
    const images = qa('img').map((i) => ({
      src: i.getAttribute('src'), alt: i.getAttribute('alt'), width: i.getAttribute('width'),
      height: i.getAttribute('height'), loading: i.getAttribute('loading'),
    }));
    const jsonld = qa('script[type="application/ld+json"]').map((s) => {
      try { return JSON.parse(s.textContent); } catch (e) { return { __parseError: e.message }; }
    });
    // Visible text and font-size distribution.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let chars = 0, small = 0, words = 0; const sizes = {};
    while (walker.nextNode()) {
      const n = walker.currentNode; const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
      if (!visible(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      chars += t.length; words += t.split(' ').length;
      sizes[fs] = (sizes[fs] || 0) + t.length;
      if (fs < 12) small += t.length;
    }
    const tapTargets = qa('a[href], button, input, select, textarea').filter(visible).map((el) => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName, text: (el.textContent || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const formControls = qa('input:not([type=hidden]), select, textarea').map((el) => ({
      id: el.id || null, type: el.type, name: el.getAttribute('name'),
      label: el.labels && el.labels.length ? el.labels[0].textContent.trim() : (el.getAttribute('aria-label') || null),
      hidden: !visible(el),
    }));
    return {
      title: document.title, titleLength: document.title.length,
      description: meta.description || null, descriptionLength: (meta.description || '').length,
      canonical: attr('link[rel=canonical]', 'href'), lang: document.documentElement.getAttribute('lang'),
      charset: document.characterSet, viewport: meta.viewport || null, robots: meta.robots || null,
      meta, icons: qa('link[rel~=icon], link[rel=apple-touch-icon], link[rel=manifest]').map((l) => ({ rel: l.rel, href: l.getAttribute('href'), type: l.type, sizes: l.getAttribute('sizes') })),
      hreflang: qa('link[rel=alternate][hreflang]').map((l) => ({ hreflang: l.hreflang, href: l.href })),
      headings, links, images, jsonld,
      text: { visibleWords: words, visibleChars: chars, pctCharsUnder12px: chars ? Math.round((small / chars) * 1000) / 10 : 0, fontSizeChars: sizes },
      tapTargets, formControls,
      scripts: qa('script').map((s) => ({ src: s.getAttribute('src'), async: s.async, defer: s.defer, type: s.type || null, inlineBytes: s.src ? 0 : s.textContent.length })),
      stylesheets: qa('link[rel=stylesheet]').map((l) => l.getAttribute('href')),
      inlineStyleBytes: qa('style').reduce((n, s) => n + s.textContent.length, 0),
      htmlBytes: document.documentElement.outerHTML.length,
      domNodes: document.getElementsByTagName('*').length,
      scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
      perf: window.__seo,
      dataLayer: (window.dataLayer || []).map((a) => { try { return Array.from(a); } catch (_) { return String(a); } }),
    };
  });

  await page.screenshot({ path: path.join(outDir, `${label}-${name}.png`), fullPage: true });
  await browser.close();
  return { viewport, status: response ? response.status() : null, finalUrl: page.url(), ...data, requests, consoleErrors, blockedAnalytics };
}

(async () => {
  const mobile = await run({ width: 390, height: 844 }, 'mobile', true);
  const desktop = await run({ width: 1366, height: 900 }, 'desktop', false);
  const out = { url, auditedAt: new Date().toISOString(), mobile, desktop };
  const file = path.join(outDir, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log('wrote', file);
})().catch((e) => { console.error(e); process.exit(1); });
