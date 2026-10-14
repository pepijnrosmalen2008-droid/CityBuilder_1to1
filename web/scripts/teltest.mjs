// Aanraaktest: tik twee punten (weg), tik "Klaar", zoneer met één vinger, controleer de wereld.
import { chromium } from 'playwright-core';
const [url] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const fouten = [];
page.on('pageerror', e => fouten.push(e.message));
await page.goto(url);
await page.waitForSelector('#laden.weg', { timeout: 600000 });
const stand = () => page.evaluate(() => { const w = window.__stad.wereld; return { seg: w.net.segmenten.size, kav: w.kavels.size, zone: [...w.kavels.values()].filter(k => k.zone !== 'geen').length, tekent: window.__stad.gereedschap.tekent }; });
await page.touchscreen.tap(100, 450); await page.waitForTimeout(1500);
await page.touchscreen.tap(300, 470); await page.waitForTimeout(2500);
console.log('na twee tikken', JSON.stringify(await stand()));
await page.click('#klaarknop'); await page.waitForTimeout(800);
console.log('na Klaar', JSON.stringify(await stand()));
// Zones: tab via de werkbalk, dan met één vinger slepen (CDP touch events).
await page.click('[data-m="zone"]');
const cdp = await ctx.newCDPSession(page);
const punt = (x, y) => [{ x, y, id: 1 }];
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punt(120, 440) });
for (let x = 120; x <= 300; x += 30) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: punt(x, 445) }); await page.waitForTimeout(300); }
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(800);
console.log('na zoneren', JSON.stringify(await stand()));
console.log(fouten.length ? fouten.join('\n') : 'geen fouten');
await browser.close();
