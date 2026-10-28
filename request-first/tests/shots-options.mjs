// Takes the 390x844 screenshots of the multi-option screens (EN + ES) into the folder given as argv[3] (default /workspace/qb-preview-shots).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright-core');
const base = process.argv[2] || 'http://localhost:8765', out = process.argv[3] || '/workspace/qb-preview-shots';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const shot = async (qs, lang, name, after) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx.route(/nominatim/i, r => r.fulfill({ json: [{ lat: '41.85', lon: '-88.0', address: { town: 'Wheaton' } }] }));
  await ctx.route(/arcgis|dupage/i, r => r.fulfill({ json: { features: [{ attributes: { ACREAGE: 0.25, PIN: '0000' } }] } }));
  const u = await ctx.newPage(); await u.goto(base + '/?view=focus&lang=' + lang + '&req=' + qs); await u.waitForTimeout(300);
  await u.fill('#iAddr', '303 W Wesley St, Wheaton, IL'); await u.locator('#lkBtn').click(); await u.waitForTimeout(1500);
  if (after) await after(u);
  await u.evaluate(() => window.scrollTo(0, 0));
  await u.screenshot({ path: out + '/' + name + '-top.png' });
  await u.screenshot({ path: out + '/' + name + '-full.png', fullPage: true });
  await ctx.close();
};
for (const lang of ['en', 'es']) {
  await shot('mow', lang, '16-options-mow-' + lang);
  await shot('mow,leaf', lang, '17-options-mow-leaf-' + lang);
  await shot('snow', lang, '18-options-snow-' + lang);
  await shot('mow,bush', lang, '19-options-mow-bush-' + lang);
  await shot('mow,leaf', lang, '20-options-toggled-single-' + lang, async u => { await u.locator('#fcMow .opt').nth(1).click(); await u.locator('#fcLeaf .opt').nth(1).click(); await u.waitForTimeout(200); });
}
await browser.close();
