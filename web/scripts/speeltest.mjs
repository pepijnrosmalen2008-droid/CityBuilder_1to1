// Speeltest: laad het spel, teken met de muis een weg, zoneer, laat de tijd lopen en controleer de wereld.
import { chromium } from 'playwright-core';
const [url = 'http://localhost:5173/?kwaliteit=laag', uit] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const fouten = [];
page.on('pageerror', e => fouten.push(e.message));
page.on('console', m => { if (m.type() === 'error') fouten.push(m.text()); });
await page.goto(url);
await page.waitForSelector('#laden.weg', { timeout: 600000 });
const stand = () => page.evaluate(() => { const w = window.__stad.wereld; return { melding: window.__stad.gereedschap.melding, vb: (v => v.soort === 'weg' ? v.tekst : v.soort)(window.__stad.gereedschap.voorbeeld()), seg: w.net.segmenten.size, knopen: w.net.knopen.size, kav: w.kavels.size, zone: [...w.kavels.values()].filter(k => k.zone !== 'geen').length, geb: w.gebouwen.size, geld: Math.round(w.geld) }; });
console.log('start', JSON.stringify(await stand()));
// Weg: twee klikken (rechte straat), daarna nog een stuk vanaf het eindpunt, dan rechts klikken.
await page.mouse.move(400, 360); await page.mouse.down(); await page.mouse.up();
await page.mouse.move(800, 380); await page.waitForTimeout(1500);
await page.mouse.down(); await page.mouse.up();
await page.mouse.move(820, 470); await page.waitForTimeout(1500);
console.log('voor 2e klik', JSON.stringify(await stand()));
await page.mouse.down(); await page.mouse.up();
await page.mouse.click(820, 470, { button: 'right' });
console.log('na wegen', JSON.stringify(await stand()));
// Bocht: C, drie klikken.
await page.keyboard.press('c');
for (const [x, y] of [[400, 360], [300, 480], [600, 480]]) { await page.mouse.move(x, y); await page.waitForTimeout(800); await page.mouse.down(); await page.mouse.up(); }
await page.mouse.click(600, 480, { button: 'right' });
console.log('na bocht', JSON.stringify(await stand()));
// Zoneren met het penseel.
await page.keyboard.press('z');
await page.mouse.move(500, 370); await page.mouse.down();
for (let x = 500; x <= 780; x += 40) { await page.mouse.move(x, 375); await page.waitForTimeout(400); }
await page.mouse.up();
console.log('na zones', JSON.stringify(await stand()));
// Tijd: 4x en even wachten.
await page.evaluate(() => { window.__stad.wereld.snelheid = 4; });
await page.waitForTimeout(15000);
console.log('na tijd', JSON.stringify(await stand()));
if (uit) await page.screenshot({ path: uit, timeout: 600000 });
console.log(fouten.length ? 'FOUTEN:\n' + fouten.join('\n') : 'geen fouten');
await browser.close();
