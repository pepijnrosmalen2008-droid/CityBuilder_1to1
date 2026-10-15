// Economie-UI: tab openen, overzicht tonen, een gebied tekenen met de muis.
import { chromium } from 'playwright-core';
const [url, uit] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const fouten = [];
page.on('pageerror', e => fouten.push(e.message));
page.on('console', m => { if (m.type() === 'error') fouten.push(m.text()); });
await page.goto(url);
await page.waitForSelector('#laden.weg', { timeout: 900000 });
await page.keyboard.press('g');
await page.waitForTimeout(500);
// Gebied tekenen: vier hoeken en afronden.
for (const [x, y] of [[300, 250], [560, 240], [580, 430], [320, 440]]) { await page.mouse.move(x, y); await page.waitForTimeout(700); await page.mouse.down(); await page.mouse.up(); }
await page.click('#klaarknop');
await page.waitForTimeout(1500);
console.log(JSON.stringify(await page.evaluate(() => { const s = window.__stad; return { melding: s.gereedschap.melding, gebieden: s.wereld.economie.gebieden.size }; })));
await page.click('[data-eco]');
await page.waitForTimeout(2500);
await page.screenshot({ path: uit, timeout: 600000 });
console.log(fouten.length ? fouten.join('\n') : 'geen fouten');
await browser.close();
