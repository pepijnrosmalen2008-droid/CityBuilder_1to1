// Wegtest: teken in de voorbeeldstad met het wegengereedschap en maak screenshots halverwege.
// Gebruik: node scripts/wegtest.mjs <url> <uitmap>
import { chromium } from 'playwright-core';
const [url = 'http://localhost:5173/?demo&groei=200&kwaliteit=laag', map = '.'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const fouten = [];
page.on('pageerror', e => fouten.push(e.message));
page.on('console', m => { if (m.type() === 'error') fouten.push(m.text()); });
await page.goto(url);
await page.waitForSelector('#laden.weg', { timeout: 900000 });
const scherm = (x, z) => page.evaluate(([x, z]) => { const s = window.__stad; s.sfeer.camera.updateMatrixWorld(); const v = new s.THREE.Vector3(x, s.wereld.terrein.hoogte(x, z), z).project(s.sfeer.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, [x, z]);
const tekst = () => page.evaluate(() => { const v = window.__stad.gereedschap.voorbeeld(); return v.soort === 'weg' ? `${v.tekst} | lijnen ${v.lijnen.length} snap ${!!v.snap} kavels ${v.kavels.length}` : v.soort; });
const ga = async (x, z, wacht = 900) => { const [a, b] = await scherm(x, z); await page.mouse.move(a, b); await page.waitForTimeout(wacht); };
const klik = async () => { await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(300); };
await page.keyboard.press('x');
// 1. Start op een bestaand knooppunt aan de rand van de stad en trek een weg naar het westen.
const k = await page.evaluate(() => { const w = window.__stad.wereld; let best = null; for (const k of w.net.knopen.values()) if (k.p.x > -600 && (!best || k.p.x < best.p.x)) best = k; return best.p; });
await page.evaluate(([x, z]) => window.__stad.camera.zet(x - 150, z - 20, 470, 0, 62), [k.x, k.z]);
await page.waitForTimeout(2500);
console.log('start bij', JSON.stringify(k), await scherm(k.x, k.z), await scherm(k.x - 140, k.z - 120));
await ga(k.x, k.z); await klik();
await ga(k.x - 140, k.z - 3, 1500);
console.log('recht:', await tekst());
await page.screenshot({ path: `${map}/w1.png` });
await klik();
// 2. Haaks afslaan (knik wordt afgerond).
await ga(k.x - 140, k.z - 120, 1500);
console.log('haaks:', await tekst());
await klik();
await page.mouse.click(10, 10, { button: 'right' });
// 3. Hoogte omhoog, viaduct-stuk tekenen.
await page.keyboard.press('PageUp'); await page.keyboard.press('PageUp');
await ga(k.x - 40, k.z - 120); await klik();
await ga(k.x - 40, k.z + 40, 1500);
console.log('verhoogd:', await tekst());
await page.screenshot({ path: `${map}/w2.png` });
await klik(); await page.mouse.click(10, 10, { button: 'right' });
await page.keyboard.press('PageDown'); await page.keyboard.press('PageDown');
// 4. Vrij tekenen.
await page.keyboard.press('c'); await page.keyboard.press('c');
await ga(k.x - 140, k.z - 120); await klik();
await ga(k.x - 220, k.z - 200, 900); await klik();
await ga(k.x - 330, k.z - 210, 1200);
console.log('vrij:', await tekst());
await page.screenshot({ path: `${map}/w3.png` });
await klik(); await page.mouse.click(10, 10, { button: 'right' });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${map}/w4.png` });
console.log('net', JSON.stringify(await page.evaluate(() => { const w = window.__stad.wereld; return { seg: w.net.segmenten.size, verhoogd: [...w.net.knopen.values()].filter(k => k.niveau).length, brug: [...w.net.segmenten.values()].filter(s => s.pad.some(p => p.brug)).length }; })));
console.log(fouten.length ? 'FOUTEN:\n' + fouten.join('\n') : 'geen fouten');
await browser.close();
