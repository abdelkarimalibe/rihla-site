#!/usr/bin/env node
/*
 * Lab speed test of one page on an emulated mid-range phone.
 *
 *   node seo/tools/perf.js <url> [runs=5]
 *
 * Throttling matches Lighthouse's mobile preset as closely as DevTools allows:
 * 150 ms round-trip latency, 1.6 Mbps down, 750 Kbps up, 4x CPU slowdown.
 * Every run starts with an empty cache. Prints the median of the runs as JSON.
 * Use it for before/after comparisons, not as an absolute score.
 */
const { chromium } = require('playwright');

const [url, runsArg] = process.argv.slice(2);
const RUNS = parseInt(runsArg || '5', 10);
if (!url) { console.error('usage: node perf.js <url> [runs]'); process.exit(2); }

const ANALYTICS = /(google-analytics\.com|analytics\.google\.com|doubleclick\.net)/;
const STUB = require('fs').readFileSync(require('path').join(__dirname, 'supabase-stub.js'), 'utf8');
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

async function once() {
  const launch = { args: ['--no-sandbox'] };
  if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' };
  const browser = await chromium.launch(launch);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.route('**/*', (r) => {
    const u = r.request().url();
    if (ANALYTICS.test(u)) return r.abort();
    // The Supabase CDN is unreachable from the sandbox: answer it with the local stand-in,
    // so sign-in pages render as they do in production instead of showing their fallback notice.
    if (/cdn\.jsdelivr\.net\/npm\/@supabase/.test(u)) return r.fulfill({ status: 200, contentType: 'application/javascript', body: STUB });
    return r.continue();
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let bytes = 0, fontBytes = 0, count = 0, failed = 0;
  const types = {};
  cdp.on('Network.responseReceived', (e) => { types[e.requestId] = e.type; });
  cdp.on('Network.loadingFinished', (e) => {
    bytes += e.encodedDataLength; count += 1;
    if (types[e.requestId] === 'Font') fontBytes += e.encodedDataLength;
  });
  cdp.on('Network.loadingFailed', () => { failed += 1; });
  await page.addInitScript(() => {
    window.__p = { lcp: 0, cls: 0, lcpEl: null };
    new PerformanceObserver((l) => {
      const e = l.getEntries().pop(); window.__p.lcp = e.startTime;
      window.__p.lcpEl = e.element ? (e.element.tagName + '.' + e.element.className) : null;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    // Every shift counts. Nobody touches the page in a lab run, yet Chromium sometimes
    // flags a shift as following "recent input" when it lands within 500 ms of the load
    // event. Filtering on that flag hid the font-swap shift on some pages and not others.
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__p.cls += e.value; })
      .observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(url, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const nav = performance.getEntriesByType('navigation')[0];
    return { fcp: fcp ? fcp.startTime : null, lcp: window.__p.lcp, lcpEl: window.__p.lcpEl, cls: window.__p.cls, load: nav.loadEventEnd, dcl: nav.domContentLoadedEventEnd };
  });
  await browser.close();
  return { ...m, bytes, fontBytes, count, failed };
}

(async () => {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await once());
  const pick = (k) => Math.round(median(runs.map((r) => r[k])));
  console.log(JSON.stringify({
    url, runs: RUNS,
    fcp_ms: pick('fcp'), lcp_ms: pick('lcp'), load_ms: pick('load'),
    cls: Math.round(median(runs.map((r) => r.cls)) * 1000) / 1000,
    transfer_kb: Math.round(median(runs.map((r) => r.bytes)) / 102.4) / 10,
    font_kb: Math.round(median(runs.map((r) => r.fontBytes)) / 102.4) / 10,
    cls_runs: runs.map((r) => Math.round(r.cls * 1000) / 1000),
    requests: pick('count'), failed_requests: pick('failed'), lcp_element: runs[0].lcpEl,
  }, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
