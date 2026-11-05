// Regenerates the social card and PNG icons with Playwright:
//   node scripts/make-images.cjs
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const root = path.join(__dirname, '..');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(root, 'scripts/og-card.html'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(root, 'assets/img/og-card.png') });
  for (const [size, name] of [[32, 'favicon-32.png'], [180, 'apple-touch-icon.png'], [512, 'icon-512.png']]) {
    const p = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await p.setContent(`<html><body style="margin:0;background:transparent"><img src="file://${path.join(root, 'favicon.svg')}" width="${size}" height="${size}" style="display:block"></body></html>`);
    await p.waitForTimeout(100);
    await p.screenshot({ path: path.join(root, 'assets/img/' + name), omitBackground: true });
    await p.close();
  }
  await browser.close();
  console.log('images written to assets/img/');
})();
