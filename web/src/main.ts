import * as THREE from 'three';
import { Wereld } from './core/wereld';
import { Gereedschap } from './core/gereedschap';
import { bouwVoorbeeldstad, bouwTestKruisingen, TEST_PLEKKEN } from './core/demo';
import { Sfeer } from './render/sfeer';
import { StadCamera } from './render/camera';
import { TextuurBron } from './render/texturen';
import { Materialen } from './render/materialen';
import { TerreinWeergave } from './render/terrein';
import { StadWeergave } from './render/stad';
import { VoorbeeldLaag } from './render/voorbeeld';
import { Hud } from './ui/hud';
import { Werkbalk } from './ui/werkbalk';
import { StraatLabels } from './ui/labels';

const param = new URLSearchParams(location.search);
const laadTekst = document.getElementById('laad-tekst')!, laadBalk = document.getElementById('laad-voortgang')!;
const voortgang = (t: string, f: number) => { laadTekst.textContent = t; laadBalk.style.width = `${Math.round(f * 100)}%`; return new Promise(r => setTimeout(r, 0)); };

async function start() {
  const kwaliteit = param.get('kwaliteit') ?? 'hoog';
  const sfeer = new Sfeer(document.getElementById('beeld') as HTMLCanvasElement, {
    schaduw: kwaliteit === 'laag' ? 2048 : 4096,
    ao: kwaliteit !== 'laag',
    pixelRatio: Math.min(devicePixelRatio, kwaliteit === 'laag' ? 1 : 1.5),
  });
  const bron = new TextuurBron();
  bron.anisotropie = sfeer.renderer.capabilities.getMaxAnisotropy();
  const mats = new Materialen(bron);

  await voortgang('Landschap vormen…', 0.1);
  const wereld = new Wereld(Number(param.get('seed') ?? 1));
  await voortgang('Texturen maken…', 0.35);
  const terrein = new TerreinWeergave(wereld.terrein, bron);
  await terrein.init();
  sfeer.scene.add(terrein.groep);

  const demo = param.has('demo');
  const test = param.get('test');
  if (test) { bouwTestKruisingen(wereld); wereld.snelheid = 0; }
  if (demo) { await voortgang('Voorbeeldstad bouwen…', 0.55); bouwVoorbeeldstad(wereld, Number(param.get('groei') ?? 1800)); }

  await voortgang('Bossen planten…', 0.7);
  const stad = new StadWeergave(wereld, mats);
  sfeer.scene.add(stad.groep);
  const camera = new StadCamera(sfeer.camera, sfeer.renderer.domElement, wereld.terrein);
  const plek = test && TEST_PLEKKEN[test];
  const c = (param.get('cam') ?? (plek ? `${plek[0]},${plek[1]},95,0,88` : demo ? '-260,-60,420,215,38' : '-150,0,520,30,48')).split(',').map(Number);
  camera.zet(c[0], c[1], c[2], c[3], c[4]);
  stad.werkBij(1e9);
  terrein.werkBij();
  stad.props.werkBij(sfeer.camera.position, 0, true);

  const gereedschap = new Gereedschap(wereld);
  const voorbeeld = new VoorbeeldLaag(wereld);
  sfeer.scene.add(voorbeeld.groep);
  const hud = new Hud(wereld);
  const labels = new StraatLabels(wereld, sfeer.camera);
  new Werkbalk(gereedschap, aan => { stad.zones.toonAlles = aan; stad.zones.vuil = true; });

  // Muis → grondpunt.
  const tip = document.getElementById('tip')!, melding = document.getElementById('melding')!;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let muis = { x: -1, y: -1 }, rechtsStart: { x: number; y: number } | null = null;
  const grondOnder = () => {
    if (muis.x < 0 || Werkbalk.boven(muis.x, muis.y)) return null;
    ndc.set(muis.x / innerWidth * 2 - 1, -(muis.y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, sfeer.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    return wereld.terrein.straal({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z });
  };
  const doek = sfeer.renderer.domElement;
  doek.addEventListener('pointermove', e => { muis = { x: e.clientX, y: e.clientY }; });
  doek.addEventListener('pointerleave', () => { muis = { x: -1, y: -1 }; });
  doek.addEventListener('pointerdown', e => {
    if (e.button === 0) gereedschap.klik(grondOnder());
    if (e.button === 2) rechtsStart = { x: e.clientX, y: e.clientY };
  });
  addEventListener('pointerup', e => {
    if (e.button === 0) gereedschap.los();
    if (e.button === 2 && rechtsStart && Math.hypot(e.clientX - rechtsStart.x, e.clientY - rechtsStart.y) < 5) gereedschap.terug();
    rechtsStart = null;
  });

  // Hulp en voorbeeldstad.
  const hulp = document.createElement('div');
  hulp.className = 'hulp paneel';
  hulp.innerHTML = `<b>Bouwen</b><br>Wegen: klik begin- en eindpunt (bocht: C).<br>Zones: Z, sleep met het penseel.<br>Rechts klikken stopt.<br>${demo ? '' : '<button class="knop" id="demo-knop" style="margin-top:8px;width:100%">Voorbeeldstad laden</button>'}`;
  document.body.appendChild(hulp);
  document.getElementById('demo-knop')?.addEventListener('click', () => { location.search = '?demo=1'; });

  await voortgang('Klaar', 1);
  await bron.wacht();
  document.getElementById('laden')!.classList.add('weg');
  (window as unknown as Record<string, unknown>).__stad = { wereld, stad, sfeer, camera, gereedschap, bron, THREE };

  if (param.has('shot')) {
    // Fotomodus (voor geautomatiseerde screenshots zonder GPU): alles opbouwen, één frame renderen.
    for (let i = 0; i < 200 && stad.bezig; i++) stad.werkBij(1e9);
    stad.props.werkBij(sfeer.camera.position, 0, true);
    await bron.wacht();
    hud.werkBij();
    const verberg = (param.get('verberg') ?? '').split(',');
    if (verberg.includes('zones')) stad.zones.mesh.visible = false;
    if (verberg.includes('ao') && sfeer.ao) sfeer.ao.enabled = false;
    if (verberg.includes('ui')) for (const id of ['hud', 'werkbalk']) document.getElementById(id)!.style.display = 'none';
    if (verberg.includes('ui')) hulp.style.display = 'none';
    sfeer.volg(camera.doel, camera.afstand);
    const t0 = performance.now();
    sfeer.render();
    if (!verberg.includes('labels')) labels.werkBij(1, camera.afstand);
    const i = sfeer.renderer.info.render;
    console.log(`frame ${Math.round(performance.now() - t0)} ms, ${i.triangles} driehoeken, ${i.calls} draw calls`);
    document.body.dataset.klaar = '1';
    return;
  }

  let vorige = performance.now(), hudKlok = 0, tijd = 0;
  const lus = (nu: number) => {
    const dt = Math.min(0.1, (nu - vorige) / 1000);
    vorige = nu; tijd += dt;
    camera.stap(dt);
    wereld.stap(dt);
    const grond = grondOnder();
    gereedschap.beweeg(grond);
    gereedschap.stap(dt);
    stad.werkBij(8);
    terrein.werkBij();
    terrein.tik(tijd);
    stad.props.werkBij(sfeer.camera.position, dt);
    const vb = gereedschap.voorbeeld();
    voorbeeld.toon(vb);
    const tekst = vb.soort === 'weg' ? (vb.as.length ? vb.tekst : '') : vb.soort === 'markeer' ? vb.tekst : '';
    tip.style.display = tekst && grond ? 'block' : 'none';
    tip.textContent = tekst;
    tip.className = vb.soort === 'weg' && !vb.geldig ? 'fout' : '';
    tip.style.left = muis.x + 'px'; tip.style.top = muis.y + 'px';
    melding.style.display = gereedschap.melding ? 'block' : 'none';
    melding.textContent = gereedschap.melding;
    hudKlok += dt;
    if (hudKlok > 0.25) { hudKlok = 0; hud.werkBij(); }
    sfeer.volg(camera.doel, camera.afstand);
    sfeer.render();
    labels.werkBij(dt, camera.afstand);
    requestAnimationFrame(lus);
  };
  requestAnimationFrame(lus);
}

start().catch(e => { laadTekst.textContent = 'Fout: ' + (e?.message ?? e); console.error(e); });
