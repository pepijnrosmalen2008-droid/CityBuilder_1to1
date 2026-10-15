import * as THREE from 'three';
import { Wereld } from './core/wereld';
import { Gereedschap } from './core/gereedschap';
import { bouwVoorbeeldstad, bouwTestKruisingen, TEST_PLEKKEN, legStartweg } from './core/demo';
import { Sfeer } from './render/sfeer';
import { KwaliteitRegelaar, Keuze } from './render/kwaliteit';
import { StadCamera } from './render/camera';
import { TextuurBron } from './render/texturen';
import { Materialen } from './render/materialen';
import { VerkeerWeergave } from './render/verkeer';
import { DienstWeergave } from './render/diensten';
import { Rijstroken } from './core/verkeer/rijstroken';
import { TerreinWeergave } from './render/terrein';
import { StadWeergave } from './render/stad';
import { VoorbeeldLaag } from './render/voorbeeld';
import { Hud } from './ui/hud';
import { Werkbalk } from './ui/werkbalk';
import { StraatLabels } from './ui/labels';
import { EconomiePaneel } from './ui/economiepaneel';

const param = new URLSearchParams(location.search);
const laadTekst = document.getElementById('laad-tekst')!, laadBalk = document.getElementById('laad-voortgang')!;
const voortgang = (t: string, f: number) => { laadTekst.textContent = t; laadBalk.style.width = `${Math.round(f * 100)}%`; return new Promise(r => setTimeout(r, 0)); };

async function start() {
  let opgeslagen: string | null = null;
  try { opgeslagen = localStorage.getItem('stad_kwaliteit'); } catch { /* geen opslag */ }
  const keuze = (param.get('kwaliteit') ?? opgeslagen ?? 'auto') as Keuze;
  const sfeer = new Sfeer(document.getElementById('beeld') as HTMLCanvasElement, KwaliteitRegelaar.startNiveau(keuze));
  const regelaar = new KwaliteitRegelaar(sfeer, keuze);
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
  else if (!test) legStartweg(wereld);

  await voortgang('Bossen planten…', 0.7);
  const stad = new StadWeergave(wereld, mats);
  sfeer.scene.add(stad.groep);
  const verkeer = new VerkeerWeergave(wereld, mats);
  sfeer.scene.add(verkeer.groep);
  const diensten = new DienstWeergave(wereld, mats);
  sfeer.scene.add(diensten.groep);
  const maxVerkeer = () => ({ laag: 300, midden: 650, hoog: 1100 } as Record<string, number>)[sfeer.niveau] ?? 600;
  const camera = new StadCamera(sfeer.camera, sfeer.renderer.domElement, wereld.terrein);
  const plek = test && TEST_PLEKKEN[test];
  // Nieuwe kaart: begin bij het eind van de snelweg.
  const eind = [...wereld.net.knopen.values()].sort((a, b) => b.p.x - a.p.x)[0];
  const start = eind ? `${eind.p.x - 40},${eind.p.z},380,90,35` : "-150,0,520,30,48";
  const c = (param.get('cam') ?? (plek ? `${plek[0]},${plek[1]},95,0,88` : demo ? '-260,-60,420,215,38' : start)).split(',').map(Number);
  camera.zet(c[0], c[1], c[2], c[3], c[4]);
  stad.werkBij(1e9);
  terrein.werkBij();
  stad.props.werkBij(sfeer.camera.position, 0, true);

  const gereedschap = new Gereedschap(wereld);
  const voorbeeld = new VoorbeeldLaag(wereld);
  sfeer.scene.add(voorbeeld.groep);
  const hud = new Hud(wereld, regelaar);
  const labels = new StraatLabels(wereld, sfeer.camera);
  const werkbalk = new Werkbalk(gereedschap, aan => { stad.zones.toonAlles = aan; stad.zones.vuil = true; }, wereld.voorzieningen);
  const ecoPaneel = new EconomiePaneel(wereld);
  werkbalk.opEconomie = () => ecoPaneel.wissel();

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
  // Muis: links = gereedschap, rechts klikken = stoppen. Aanraken: tikken = klikken, slepen = schuiven
  // (in de zonemodus: schilderen), twee vingers = camera.
  camera.eenVingerPannen = () => gereedschap.modus !== 'zone';
  let tik: { x: number; y: number; t: number; id: number } | null = null;
  doek.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && camera.aantalVingers > 1) return;
    muis = { x: e.clientX, y: e.clientY };
    if (tik && Math.hypot(e.clientX - tik.x, e.clientY - tik.y) > 12) tik = null;
  });
  doek.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') muis = { x: -1, y: -1 }; });
  doek.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') {
      muis = { x: e.clientX, y: e.clientY };
      if (camera.aantalVingers > 1) { tik = null; gereedschap.los(); return; }
      tik = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      if (gereedschap.modus === 'zone') gereedschap.klik(grondOnder());
      return;
    }
    if (e.button === 0) gereedschap.klik(grondOnder());
    if (e.button === 2) rechtsStart = { x: e.clientX, y: e.clientY };
  });
  addEventListener('pointerup', e => {
    if (e.pointerType === 'touch') {
      gereedschap.los();
      if (tik && tik.id === e.pointerId && performance.now() - tik.t < 400 && gereedschap.modus !== 'zone') {
        muis = { x: tik.x, y: tik.y };
        gereedschap.klik(grondOnder());
      }
      tik = null;
      return;
    }
    if (e.button === 0) gereedschap.los();
    if (e.button === 2 && rechtsStart && Math.hypot(e.clientX - rechtsStart.x, e.clientY - rechtsStart.y) < 5) gereedschap.terug();
    rechtsStart = null;
  });
  // Knop "Klaar" tijdens het tekenen van een weg (vooral voor aanraakschermen).
  const klaar = document.createElement('button');
  klaar.id = 'klaarknop'; klaar.className = 'knop'; klaar.textContent = 'Klaar met tekenen';
  klaar.onclick = () => { if (gereedschap.modus === 'gebied') gereedschap.rondGebiedAf(); else gereedschap.terug(); };
  document.body.appendChild(klaar);

  // Zoomknoppen (vooral voor telefoons).
  const zoom = document.createElement('div');
  zoom.id = 'zoomknoppen';
  zoom.innerHTML = '<button class="knop rond" data-z="0.6" aria-label="Inzoomen">+</button><button class="knop rond" data-z="1.65" aria-label="Uitzoomen">−</button>';
  zoom.querySelectorAll<HTMLElement>('[data-z]').forEach(b => (b.onclick = () => camera.zoomStap(Number(b.dataset.z))));
  document.body.appendChild(zoom);

  // Hulp en voorbeeldstad.
  const hulp = document.createElement('div');
  hulp.className = 'hulp paneel';
  hulp.innerHTML = `<b>Bouwen</b><br>Wegen: klik begin- en eindpunt. C = recht / bocht / vrij, PgUp/PgDn = hoogte, H = hulplijnen.<br>Zones: Z, sleep met het penseel.<br>Stroom, water, afval: N (aan een weg).<br>Rechts klikken stopt.<br>${demo ? '' : '<button class="knop" id="demo-knop" style="margin-top:8px;width:100%">Voorbeeldstad laden</button>'}`;
  document.body.appendChild(hulp);
  document.getElementById('demo-knop')?.addEventListener('click', () => { location.search = '?demo=1'; });

  await voortgang('Klaar', 1);
  await bron.wacht();
  document.getElementById('laden')!.classList.add('weg');
  (window as unknown as Record<string, unknown>).__stad = { wereld, stad, sfeer, camera, gereedschap, bron, THREE };

  if (param.has('shot')) {
    // Fotomodus (voor geautomatiseerde screenshots zonder GPU): alles opbouwen, één frame renderen.
    for (let i = 0; i < 200 && stad.bezig; i++) stad.werkBij(1e9);
    // Verkeer een minuut laten rijden voor de foto.
    if (!param.has('geenverkeer')) { const sn = wereld.snelheid; wereld.snelheid = 1; wereld.verkeer.max = maxVerkeer(); for (let i = 0; i < Number(param.get('verkeer') ?? 600); i++) wereld.verkeer.stap(0.1); wereld.snelheid = sn; }
    if (param.has('naauto')) {
      // Camera op een voertuig (voor controle van de modellen): ?naauto=soort,afstand,yaw,pitch
      const [soort, af, yaw, pitch] = (param.get('naauto') ?? '').split(',');
      const v = [...wereld.verkeer.voertuigen.values()].find(x => (!soort || x.soort === soort) && x.v > 3);
      const sp = v && wereld.verkeer.stroken.sporen.get(v.spoor);
      if (v && sp) { const pos = Rijstroken.op(sp, v.s - v.lengte / 2); camera.zet(pos.x, pos.z, Number(af || 12), Number(yaw || 30), Number(pitch || 25)); }
    }
    verkeer.werkBij(sfeer.camera.position);
    wereld.voorzieningen.bereken();
    diensten.werkBij(0, sfeer.camera, 1);
    stad.props.werkBij(sfeer.camera.position, 0, true);
    await bron.wacht();
    hud.werkBij();
    const verberg = (param.get('verberg') ?? '').split(',');
    if (verberg.includes('zones')) stad.zones.mesh.visible = false;
    if (verberg.includes('ao') && sfeer.ao) sfeer.ao.enabled = false;
    if (verberg.includes('ui')) for (const id of ['hud', 'werkbalk', 'zoomknoppen']) document.getElementById(id)!.style.display = 'none';
    if (verberg.includes('ui')) { hulp.style.display = 'none'; document.getElementById('nieuws')?.remove(); }
    sfeer.volg(camera.doel, camera.afstand);
    const t0 = performance.now();
    sfeer.render();
    if (!verberg.includes('labels')) labels.werkBij(1, camera.afstand);
    // Statistiek van alleen de scène (zonder nabewerking), incl. schaduwpass.
    sfeer.renderer.info.autoReset = false; sfeer.renderer.info.reset();
    sfeer.renderer.shadowMap.needsUpdate = true;
    sfeer.renderer.render(sfeer.scene, sfeer.camera);
    const i = sfeer.renderer.info.render;
    console.log(`frame ${Math.round(performance.now() - t0)} ms, ${i.triangles} driehoeken, ${i.calls} draw calls (scène + schaduw)`);
    sfeer.renderer.info.autoReset = true;
    sfeer.render();
    document.body.dataset.klaar = '1';
    return;
  }

  let vorige = performance.now(), hudKlok = 0, tijd = 0;
  const lus = (nu: number) => {
    const dt = Math.min(0.1, (nu - vorige) / 1000);
    vorige = nu; tijd += dt;
    camera.stap(dt);
    wereld.verkeer.max = maxVerkeer();
    wereld.stap(dt);
    verkeer.werkBij(sfeer.camera.position);
    if (diensten.werkBij(dt, sfeer.camera, wereld.snelheid)) sfeer.schaduwVuil();
    const grond = grondOnder();
    gereedschap.beweeg(grond);
    gereedschap.stap(dt);
    const voor = stad.bezig;
    stad.werkBij(8);
    if (voor || stad.bezig) sfeer.schaduwVuil();
    regelaar.tik(dt);
    terrein.werkBij();
    terrein.tik(tijd);
    if (stad.props.werkBij(sfeer.camera.position, dt)) sfeer.schaduwVuil();
    const vb = gereedschap.voorbeeld();
    voorbeeld.toon(vb);
    const tekst = vb.soort === 'weg' ? (vb.as.length ? vb.tekst : '') : vb.soort === 'markeer' || vb.soort === 'gebied' || vb.soort === 'dienst' ? vb.tekst : '';
    tip.style.display = tekst && grond ? 'block' : 'none';
    tip.textContent = tekst;
    tip.className = (vb.soort === 'weg' || vb.soort === 'dienst') && !vb.geldig ? 'fout' : '';
    tip.style.left = muis.x + 'px'; tip.style.top = muis.y + 'px';
    melding.style.display = gereedschap.melding ? 'block' : 'none';
    klaar.style.display = gereedschap.tekent ? 'block' : 'none';
    klaar.textContent = gereedschap.modus === 'gebied' ? 'Gebied afronden' : 'Klaar met tekenen';
    stad.economie.toonKaart(gereedschap.modus === 'gebied' ? gereedschap.grondstof : null);
    melding.textContent = gereedschap.melding;
    hudKlok += dt;
    if (hudKlok > 0.25) { hudKlok = 0; hud.werkBij(); hud.fps(regelaar); ecoPaneel.werkBij(); werkbalk.werkBijBalans(); }
    sfeer.volg(camera.doel, camera.afstand);
    sfeer.render();
    labels.werkBij(dt, camera.afstand);
    requestAnimationFrame(lus);
  };
  requestAnimationFrame(lus);
}

start().catch(e => { laadTekst.textContent = 'Fout: ' + (e?.message ?? e); console.error(e); });
