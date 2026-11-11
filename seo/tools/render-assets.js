#!/usr/bin/env node
/*
 * Renders the site's image assets from their sources:
 *
 *   favicon.svg                      -> icon-512.png, favicon.ico (via make-ico.py)
 *   seo/tools/assets/touch-icon.svg  -> apple-touch-icon.png (180x180)
 *   seo/tools/assets/og-image.html   -> og-image.png (1200x630)
 *
 *   node seo/tools/render-assets.js && python3 seo/tools/make-ico.py
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const tmp = path.join(__dirname, '.tmp');
fs.mkdirSync(tmp, { recursive: true });

async function svgToPng(browser, svgFile, size, outFile) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const svg = fs.readFileSync(svgFile, 'utf8');
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: outFile, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}

(async () => {
  const launch = { args: ['--no-sandbox'] };
  if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' };
  const browser = await chromium.launch(launch);

  await svgToPng(browser, path.join(root, 'favicon.svg'), 512, path.join(root, 'icon-512.png'));
  for (const s of [16, 32, 48]) await svgToPng(browser, path.join(root, 'favicon.svg'), s, path.join(tmp, `favicon-${s}.png`));
  await svgToPng(browser, path.join(__dirname, 'assets', 'touch-icon.svg'), 180, path.join(root, 'apple-touch-icon.png'));

  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'assets', 'og-image.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const fontsOk = await page.evaluate(() => document.fonts.check("700 56px Manrope") && document.fonts.check("700 188px Amiri", "رحلة"));
  if (!fontsOk) { console.error('Brand fonts did not load; og-image.png not written.'); process.exit(1); }
  await page.screenshot({ path: path.join(root, 'og-image.png'), clip: { x: 0, y: 0, width: 1200, height: 630 } });
  await browser.close();
  console.log('rendered icon-512.png, apple-touch-icon.png, og-image.png and favicon sizes');
})().catch((e) => { console.error(e); process.exit(1); });
