// Screenshot in een telefoonformaat met aanraakscherm.
import { chromium } from 'playwright-core';
const [url, uit] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const fouten = [];
page.on('pageerror', e => fouten.push(e.message));
await page.goto(url);
await page.waitForSelector('body[data-klaar="1"]', { timeout: 900000 });
await page.waitForTimeout(800);
await page.screenshot({ path: uit, timeout: 600000 });
console.log(fouten.length ? fouten.join('\n') : 'geen fouten');
await browser.close();
