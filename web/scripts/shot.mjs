// Maakt screenshots van het spel in headless Chromium (software-WebGL), voor controle zonder GPU.
// Gebruik: node scripts/shot.mjs <url> <uit.png> [breedte] [hoogte] [wachtSeconden]
import { chromium } from 'playwright-core';
const [url, uit, b = '1600', h = '900', wacht = '4'] = process.argv.slice(2);
const pad = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: pad, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: Number(b), height: Number(h) } });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
try { await page.waitForSelector('body[data-klaar="1"]', { timeout: 900000 }); } catch { logs.push('[shot] niet klaar'); }
console.log('klaar na', ((Date.now() - t0) / 1000).toFixed(1), 's');
await page.waitForTimeout(Number(wacht) * 1000);
await page.screenshot({ path: uit, timeout: 600000 });
const verdeling = await page.evaluate(() => { const s = window.__stad; if (!s) return null;
  const r = {}; const cam = s.sfeer.camera;
  for (const c of s.sfeer.scene.children) { let n = 0, sch = 0; c.traverse(o => { if (!o.isMesh || !o.visible) return; let p = o; while (p) { if (!p.visible) return; p = p.parent; } const g = Array.isArray(o.material) ? o.geometry.groups.length || 1 : 1; if (o.layers.test(cam.layers)) n += g; if (o.castShadow) sch += o.layers.mask & 2 ? 1 : g; }); r[c.name || c.type + c.children.length] = n + '/' + sch; }
  return r; });
console.log('tekenopdrachten (scène/schaduw)', JSON.stringify(verdeling));
console.log('vakken', JSON.stringify(await page.evaluate(() => { const t = window.__stad.stad.tegels; const r = []; for (const [naam, n] of [['dicht', t.dicht], ['ver', t.ver]]) for (const [v, g] of n.meshes) if (g.visible) r.push(naam + ':' + g.children[0].geometry.groups.length); return r; })));
console.log('stad', JSON.stringify(await page.evaluate(() => { const s = window.__stad, cam = s.sfeer.camera; const r = {}; for (const [k, c] of Object.entries({ props: s.stad.props.groep, tegels: s.stad.tegels.groep, eco: s.stad.economie.groep })) { let n = 0; c.traverse(o => { if (!o.isMesh) return; let p = o; while (p) { if (!p.visible) return; p = p.parent; } if (o.layers.test(cam.layers)) n += Array.isArray(o.material) ? o.geometry.groups.length : 1; }); r[k] = n; } return r; })));
const info = await page.evaluate(() => { const s = window.__stad; if (!s) return null;
  const tel = (o) => { let n = 0; o.traverse(m => { if (m.geometry && m.visible !== false) { const c = m.geometry.index ? m.geometry.index.count / 3 : 0; n += c * (m.isInstancedMesh ? m.count : 1); } }); return Math.round(n / 1000) + 'k'; };
  console.log('driehoeken per laag', JSON.stringify({ tegels: tel(s.stad.tegels.groep), props: tel(s.stad.props.groep), zones: tel(s.stad.zones.mesh), alles: tel(s.sfeer.scene), bomen: s.wereld.bomen.n })); const i = s.sfeer.renderer.info; return { tri: i.render.triangles, calls: i.render.calls, geb: s.wereld.gebouwen.size, kav: s.wereld.kavels.size, seg: s.wereld.net.segmenten.size, inw: s.wereld.stat.inwoners }; });
console.log(JSON.stringify(info));
for (const l of logs.slice(0, 40)) console.log(l);
await browser.close();
