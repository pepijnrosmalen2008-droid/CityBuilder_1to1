// Infotest: voorbeeldstad, klik in Kijken op een gebouw (infopaneel) en zet infoweergaven aan.
import { chromium } from 'playwright-core';
const [url = 'http://localhost:5173/?demo&groei=900&kwaliteit=laag', map = '.'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const fouten = [];
page.on('pageerror', e => fouten.push(e.message));
page.on('console', m => { if (m.type() === 'error') fouten.push(m.text()); });
await page.goto(url);
await page.waitForSelector('#laden.weg', { timeout: 900000 });
await page.evaluate(() => window.__stad.camera.zet(-300, -100, 260, 30, 45));
await page.waitForTimeout(3000);
await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
// Gebouw het dichtst bij het midden van het scherm aanklikken.
const p = await page.evaluate(() => { const s = window.__stad; s.sfeer.camera.updateMatrixWorld(); let best = null; for (const g of s.wereld.gebouwen.values()) { if (!g.klaar) continue; const v = new s.THREE.Vector3(g.centrum.x, g.y + 2, g.centrum.z).project(s.sfeer.camera); const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight; const d = Math.hypot(x - innerWidth / 2, y - innerHeight * 0.42); if (!best || d < best.d) best = { x, y, d }; } return best; });
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(2500);
console.log('infopaneel', await page.evaluate(() => document.getElementById('infopaneel').innerText.replace(/\n+/g, ' | ').slice(0, 400)));
await page.screenshot({ path: `${map}/i1.png` });
for (const [k, n] of [['grondwaarde', 'i2'], ['brand', 'i3'], ['verkeer', 'i4']]) {
  await page.click(`[data-info="${k}"]`); await page.waitForTimeout(3500);
  await page.screenshot({ path: `${map}/${n}.png` });
}
console.log(fouten.length ? 'FOUTEN:\n' + fouten.join('\n') : 'geen fouten');
await browser.close();
