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
// Schuiven: in de kijkmodus één vinger 120 px naar rechts; het grondpunt onder de vinger moet meegaan.
await page.click('[data-m="kijk"]');
const onder = (x, y) => page.evaluate(([x, y]) => { const s = window.__stad; s.sfeer.camera.updateMatrixWorld(); const r = new s.THREE.Raycaster(); r.setFromCamera(new s.THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), s.sfeer.camera); const o = r.ray.origin, d = r.ray.direction; return s.wereld.terrein.straal({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z }); }, [x, y]);
const scherm = (p) => page.evaluate((p) => { const s = window.__stad; s.sfeer.camera.updateMatrixWorld(); const v = new s.THREE.Vector3(p.x, p.y, p.z).project(s.sfeer.camera); return [Math.round((v.x + 1) / 2 * innerWidth), Math.round((1 - v.y) / 2 * innerHeight)]; }, p);
const g0 = await onder(150, 400);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punt(150, 400) });
for (let x = 150; x <= 270; x += 20) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: punt(x, 400) }); await page.waitForTimeout(80); }
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(300);
console.log('schuiven: grondpunt nu op', JSON.stringify(await scherm(g0)), '(verwacht rond 270,400)');
// Knijpen: twee vingers uit elkaar = inzoomen, pitch blijft gelijk.
const voor = await page.evaluate(() => ({ a: window.__stad.camera.doelAfstand, p: window.__stad.camera.pitch }));
const twee = (d) => [{ x: 195 - d, y: 420, id: 1 }, { x: 195 + d, y: 400, id: 2 }];
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: twee(40) });
for (let d = 40; d <= 140; d += 10) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: twee(d) }); await page.waitForTimeout(50); }
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const na = await page.evaluate(() => ({ a: window.__stad.camera.doelAfstand, p: window.__stad.camera.pitch }));
console.log('knijpen: afstand', Math.round(voor.a), '->', Math.round(na.a), 'kanteling gelijk:', Math.abs(voor.p - na.p) < 0.01);
console.log(fouten.length ? fouten.join('\n') : 'geen fouten');
await browser.close();
