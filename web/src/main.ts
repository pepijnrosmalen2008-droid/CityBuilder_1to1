import * as THREE from 'three';
import { Wereld } from './core/wereld';
import { Gereedschap } from './core/gereedschap';
import { bouwVoorbeeldstad, bouwTestKruisingen, TEST_PLEKKEN, legStartweg } from './core/demo';
import { Sfeer } from './render/sfeer';
import { KwaliteitRegelaar, Keuze } from './render/kwaliteit';
import { StadCamera } from './render/camera';
import { TextuurBron } from './render/texturen';
import { Materialen } from './render/materialen';
import { StraatLevenWeergave } from './render/straatleven';
import { VerkeersLaag } from './render/verkeerslaag';
import { VerkeerWeergave } from './render/verkeer';
import { DienstWeergave } from './render/diensten';
import { DistrictLaag } from './render/districtlaag';
import { DagNacht } from './render/dagnacht';
import { LichtLaag } from './render/licht';
import { InfoLaag, InfoSoort, INFO_NAAM, INFO_LEGENDA } from './render/infolaag';
import { InfoPaneel } from './ui/infopaneel';
import { ICOON } from './ui/iconen';
import { Rijstroken } from './core/verkeer/rijstroken';
import { TerreinWeergave } from './render/terrein';
import { StadWeergave } from './render/stad';
import { VoorbeeldLaag } from './render/voorbeeld';
import { Hud } from './ui/hud';
import { Werkbalk } from './ui/werkbalk';
import { StraatLabels } from './ui/labels';
import { EconomiePaneel } from './ui/economiepaneel';
import { bewaar, laad, laadInfo } from './opslag';

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

  // Startkeuze: doorgaan met de opgeslagen stad, een nieuwe stad of de voorbeeldstad.
  const vrij = !param.has('shot') && !param.has('demo') && !param.has('test') && !param.has('seed') && !param.has('nieuw');
  let keuzeStart: 'doorgaan' | 'nieuw' | 'voorbeeld' = 'nieuw';
  const info = vrij ? await laadInfo() : null;
  if (info) {
    const kaart = document.querySelector('.laad-kaart')!;
    const keuzes = document.createElement('div');
    keuzes.className = 'startkeuze';
    keuzes.innerHTML = `<button class="knop hoofd" data-s="doorgaan"><b>Doorgaan met ${info.naam}</b><span>${info.inwoners.toLocaleString('nl-NL')} inwoners · ${info.datum} · opgeslagen ${new Date(info.opgeslagen).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></button><button class="knop" data-s="nieuw"><b>Nieuwe stad</b></button><button class="knop" data-s="voorbeeld"><b>Voorbeeldstad</b></button>`;
    kaart.appendChild(keuzes);
    laadTekst.textContent = 'Kies hoe je wilt beginnen';
    keuzeStart = await new Promise(ok => keuzes.querySelectorAll<HTMLElement>('[data-s]').forEach(b => (b.onclick = () => ok(b.dataset.s as typeof keuzeStart))));
    keuzes.remove();
  }
  const opgeslagenStad = keuzeStart === 'doorgaan' ? await laad<ReturnType<Wereld['naarJson']>>() : null;

  await voortgang('Landschap vormen…', 0.1);
  const wereld = new Wereld(opgeslagenStad?.seed ?? Number(param.get('seed') ?? 1));
  await voortgang('Texturen maken…', 0.35);
  const terrein = new TerreinWeergave(wereld.terrein, bron);
  await terrein.init();
  sfeer.scene.add(terrein.groep);

  const demo = param.has('demo') || keuzeStart === 'voorbeeld';
  const test = param.get('test');
  if (test) { bouwTestKruisingen(wereld); wereld.snelheid = 0; }
  if (demo) { await voortgang('Voorbeeldstad bouwen…', 0.55); bouwVoorbeeldstad(wereld, Number(param.get('groei') ?? 1800)); }
  else if (opgeslagenStad) { await voortgang('Stad laden…', 0.55); wereld.laadJson(opgeslagenStad); }
  else if (!test) legStartweg(wereld);

  await voortgang('Bossen planten…', 0.7);
  const stad = new StadWeergave(wereld, mats);
  stad.cam = sfeer.camera.position;
  // Afstand waarop stadsblokken naar de vereenvoudigde versie gaan, per kwaliteitsniveau.
  const lodVoor = () => ({ laag: 300, midden: 380, hoog: 480 } as Record<string, number>)[sfeer.niveau] ?? 560;
  stad.tegels.lodAfstand = lodVoor();
  sfeer.scene.add(stad.groep);
  const verkeer = new VerkeerWeergave(wereld, mats);
  sfeer.scene.add(verkeer.groep);
  // Voetgangers en fietsers dichtbij; aantal per kwaliteitsniveau.
  const straatLeven = new StraatLevenWeergave(wereld);
  sfeer.scene.add(straatLeven.groep);
  const levenMax = () => ({ laag: 110, midden: 200, hoog: 320 } as Record<string, number>)[sfeer.niveau] ?? 200;
  const diensten = new DienstWeergave(wereld, mats);
  sfeer.scene.add(diensten.groep);
  diensten.props = stad.props;
  const infoLaag = new InfoLaag(wereld);
  sfeer.scene.add(infoLaag.groep);
  const districtLaag = new DistrictLaag(wereld, sfeer.camera);
  sfeer.scene.add(districtLaag.groep);
  // Dag en nacht (instelling bewaard; ?uur=21 voor schermafbeeldingen).
  const dagNacht = new DagNacht(sfeer, mats, Number(param.get('uur') ?? 10));
  try { dagNacht.aan = localStorage.getItem('stad_dagnacht') !== 'uit'; } catch { /* geen opslag */ }
  if (param.has('uur')) dagNacht.aan = true;
  const lichtLaag = new LichtLaag(stad.props, (x, z) => wereld.terrein.hoogte(x, z));
  sfeer.scene.add(lichtLaag.groep);
  const maxVerkeer = () => ({ laag: 300, midden: 650, hoog: 1100 } as Record<string, number>)[sfeer.niveau] ?? 600;
  const camera = new StadCamera(sfeer.camera, sfeer.renderer.domElement, wereld.terrein);
  const plek = test && TEST_PLEKKEN[test];
  // Nieuwe kaart: begin bij het eind van de snelweg.
  const eind = opgeslagenStad && wereld.gebouwen.size ? null : [...wereld.net.knopen.values()].sort((a, b) => b.p.x - a.p.x)[0];
  let mid = { x: -150, z: 0 };
  if (opgeslagenStad && wereld.gebouwen.size) { let x = 0, z = 0; for (const g of wereld.gebouwen.values()) { x += g.centrum.x; z += g.centrum.z; } mid = { x: x / wereld.gebouwen.size, z: z / wereld.gebouwen.size }; }
  const start = eind ? `${eind.p.x - 40},${eind.p.z},380,90,35` : `${mid.x},${mid.z},520,30,48`;
  const c = (param.get('cam') ?? (plek ? `${plek[0]},${plek[1]},95,0,88` : demo ? '-260,-60,420,215,38' : start)).split(',').map(Number);
  camera.zet(c[0], c[1], c[2], c[3], c[4]);
  stad.werkBij(1e9);
  terrein.werkBij();
  stad.props.werkBij(sfeer.camera.position, 0, true);

  const gereedschap = new Gereedschap(wereld);
  const voorbeeld = new VoorbeeldLaag(wereld);
  sfeer.scene.add(voorbeeld.groep);
  const hud = new Hud(wereld, regelaar);
  hud.dagNacht = () => dagNacht.aan;
  hud.wisselDagNacht = () => { dagNacht.aan = !dagNacht.aan; try { localStorage.setItem('stad_dagnacht', dagNacht.aan ? 'aan' : 'uit'); } catch { /* geen opslag */ } };
  hud.klok = () => dagNacht.aan ? dagNacht.uurTekst() : '';
  const labels = new StraatLabels(wereld, sfeer.camera);
  const werkbalk = new Werkbalk(gereedschap, aan => { stad.zones.toonAlles = aan; stad.zones.vuil = true; }, wereld.voorzieningen);
  const ecoPaneel = new EconomiePaneel(wereld);
  werkbalk.opEconomie = () => ecoPaneel.wissel();
  werkbalk.hulpStat = () => wereld.hulpdiensten.stat;
  werkbalk.aanzien = () => wereld.voorzieningen.aanzienGeluk;
  werkbalk.districten = wereld.districten;
  werkbalk.opDistrictModus = aan => districtLaag.toon(aan);
  // Verkeersgereedschap (TM:PE): klikbare iconen boven de kruispunten.
  const verkeersLaag = new VerkeersLaag(wereld, sfeer.camera, gereedschap, () => werkbalk.teken());
  werkbalk.regels = () => wereld.net.regels;
  werkbalk.opVerkeerWissen = () => wereld.verkeer.wis();
  werkbalk.opModus = m => { verkeersLaag.aan = m === 'verkeer'; };

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
  const zoneSleept = () => gereedschap.modus === 'zone' && gereedschap.zoneTool !== 'vullen';
  // Verplaatsen (Move It): met één vinger een gekozen ding slepen; elders schuift de kaart.
  let toolSleept = false;
  camera.eenVingerPannen = () => !zoneSleept() && !toolSleept;
  const mv = gereedschap.verplaatser;
  camera.negeer = k => gereedschap.modus === 'verplaats' && (!mv.leeg || gereedschap.plakModus) && ['q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'pageup', 'pagedown'].includes(k);
  // Rechthoekselectie: schermhoeken naar de grond (vlak op de hoogte van het kijkpunt als je de lucht raakt).
  const vlak = new THREE.Plane();
  const grondOp = (x: number, y: number) => {
    ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, sfeer.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    const h = wereld.terrein.straal({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z });
    if (h) return { x: h.x, z: h.z };
    vlak.set(new THREE.Vector3(0, 1, 0), -camera.doel.y);
    const q = ray.ray.intersectPlane(vlak, new THREE.Vector3());
    return q ? { x: q.x, z: q.z } : null;
  };
  let veldStart: { x: number; y: number } | null = null;
  let tik: { x: number; y: number; t: number; id: number } | null = null;
  doek.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch' && camera.aantalVingers > 1) return;
    muis = { x: e.clientX, y: e.clientY };
    if (tik && Math.hypot(e.clientX - tik.x, e.clientY - tik.y) > 12) tik = null;
    if (veldStart && gereedschap.selecteertVeld) {
      const a = veldStart, b = muis;
      const h = [grondOp(a.x, a.y), grondOp(b.x, a.y), grondOp(b.x, b.y), grondOp(a.x, b.y)];
      gereedschap.veld = h.every(Boolean) && Math.hypot(b.x - a.x, b.y - a.y) > 6 ? h as { x: number; z: number }[] : null;
    }
  });
  doek.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') muis = { x: -1, y: -1 }; });
  doek.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') {
      muis = { x: e.clientX, y: e.clientY };
      if (camera.aantalVingers > 1) { tik = null; gereedschap.los(); return; }
      tik = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      if (zoneSleept()) gereedschap.klik(grondOnder());
      // Move It op een aanraakscherm: begin je op iets dat gekozen is (of op de buiggreep), dan sleep je het.
      if (gereedschap.modus === 'verplaats' && !gereedschap.plakModus) {
        const g0 = grondOnder();
        const p0 = g0 ? { x: g0.x, z: g0.z } : null;
        const d0 = p0 ? mv.raak(p0) : null, gr = mv.greep();
        if (p0 && ((d0 && mv.heeft(d0)) || (gr && Math.hypot(gr.p.x - p0.x, gr.p.z - p0.z) < 6))) { toolSleept = true; tik = null; gereedschap.shift = gereedschap.shiftVast; gereedschap.klik(g0); }
      }
      return;
    }
    gereedschap.shift = e.shiftKey || gereedschap.shiftVast;
    if (e.button === 0) { veldStart = { x: e.clientX, y: e.clientY }; gereedschap.klik(grondOnder()); }
    if (e.button === 2) rechtsStart = { x: e.clientX, y: e.clientY };
  });
  addEventListener('pointerup', e => {
    if (e.pointerType === 'touch') {
      toolSleept = false;
      gereedschap.los();
      if (tik && tik.id === e.pointerId && performance.now() - tik.t < 400 && !zoneSleept()) {
        muis = { x: tik.x, y: tik.y };
        gereedschap.shift = gereedschap.shiftVast;
        gereedschap.klik(grondOnder());
        gereedschap.los();
      }
      tik = null;
      return;
    }
    if (e.button === 0) { gereedschap.los(); veldStart = null; }
    if (e.button === 2 && rechtsStart && Math.hypot(e.clientX - rechtsStart.x, e.clientY - rechtsStart.y) < 5 && !gereedschap.rechts(grondOnder())) gereedschap.terug();
    rechtsStart = null;
  });
  // Knop "Klaar" tijdens het tekenen van een weg (vooral voor aanraakschermen).
  const klaar = document.createElement('button');
  klaar.id = 'klaarknop'; klaar.className = 'knop'; klaar.textContent = 'Klaar met tekenen';
  klaar.onclick = () => { if (gereedschap.modus === 'gebied') gereedschap.rondGebiedAf(); else gereedschap.terug(); };
  document.body.appendChild(klaar);

  // Infopaneel (Kijken: klik op een gebouw of voorziening).
  const infoPaneel = new InfoPaneel(wereld);
  infoPaneel.sluit = () => { gereedschap.selectie = null; };
  infoPaneel.sloop = (soort, id) => { if (soort === 'gebouw') wereld.verwijderGebouw(id); else wereld.voorzieningen.sloop(id); gereedschap.selectie = null; };
  let selectieNu = '';
  // Infoweergaven (knoppen links).
  const infoKnoppen = document.createElement('div');
  infoKnoppen.id = 'infoknoppen'; infoKnoppen.className = 'paneel';
  const INFO_ICOON: Record<InfoSoort, string> = { verkeer: ICOON.auto, stroom: ICOON.bliksem, water: ICOON.druppel, afval: ICOON.vuilnis, brand: ICOON.vlam, politie: ICOON.schild, zorg: ICOON.kruis, grondwaarde: ICOON.euro, niveau: ICOON.ster };
  const tekenInfo = () => {
    infoKnoppen.innerHTML = (Object.keys(INFO_NAAM) as InfoSoort[]).map(k => `<button class="knop rond ${infoLaag.soort === k ? 'aan' : ''}" data-info="${k}" title="${INFO_NAAM[k]}">${INFO_ICOON[k]}</button>`).join('') +
      (infoLaag.soort ? `<div class="info-legenda"><b>${INFO_NAAM[infoLaag.soort]}</b><span>${INFO_LEGENDA[infoLaag.soort]}</span></div>` : '');
    infoKnoppen.querySelectorAll<HTMLElement>('[data-info]').forEach(b => (b.onclick = () => { const k = b.dataset.info as InfoSoort; infoLaag.zet(infoLaag.soort === k ? null : k); tekenInfo(); }));
  };
  tekenInfo();
  document.body.appendChild(infoKnoppen);

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

  // Laadscherm pas weg als de stad (in de worker) is opgebouwd: geen lege vakken bij het begin.
  await voortgang('Stad opbouwen…', 0.9);
  for (let i = 0; i < 400 && (stad.bezig - stad.tegels.bezig); i++) stad.werkBij(1e9);
  stad.werkBij(1e9);
  await stad.tegels.klaar();
  await voortgang('Klaar', 1);
  await bron.wacht();
  document.getElementById('laden')!.classList.add('weg');
  (window as unknown as Record<string, unknown>).__stad = { wereld, stad, sfeer, camera, gereedschap, bron, THREE, werkbalk };

  if (param.has('shot')) {
    // Fotomodus (voor geautomatiseerde screenshots zonder GPU): alles opbouwen, één frame renderen.
    for (let i = 0; i < 200 && (stad.bezig - stad.tegels.bezig); i++) stad.werkBij(1e9);
    stad.werkBij(1e9);
    await stad.tegels.klaar();
    // Verkeer een minuut laten rijden voor de foto.
    if (param.has('brand')) {
      // Testbrand in het gebouw het dichtst bij het camerapunt.
      let best = null as null | { id: number; d: number };
      for (const g of wereld.gebouwen.values()) { const d = Math.hypot(g.centrum.x - camera.doel.x, g.centrum.z - camera.doel.z); if (g.klaar && (!best || d < best.d)) best = { id: g.id, d }; }
      if (best) wereld.hulpdiensten.steekAan(best.id, 0.5);
    }
    if (param.has('naartype')) {
      // Test: camera op het eerste gebouw van een type: ?naartype=villa,afstand,yaw,pitch
      const [type, af, yaw, pitch] = (param.get('naartype') ?? '').split(',');
      const g = [...wereld.gebouwen.values()].find(x => x.type === type && x.klaar);
      if (g) camera.zet(g.centrum.x, g.centrum.z, Number(af || 45), Number(yaw || 200), Number(pitch || 30));
    }
    for (const k of ['naardienst', 'naarbedrijf'] as const) if (param.has(k)) {
      const [soort, af, yaw, pitch] = (param.get(k) ?? '').split(',');
      const lijst = k === 'naardienst' ? [...wereld.voorzieningen.diensten.values()] : [...wereld.economie.bedrijven.values()];
      const x = lijst.find(q => q.soort === soort);
      if (x) camera.zet(x.p.x, x.p.z, Number(af || 120), Number(yaw || 200), Number(pitch || 35));
    }
    if (param.has('verbouw')) {
      // Test: panden rond het camerapunt in de steigers zetten.
      const bij = [...wereld.gebouwen.values()].filter(g => g.klaar).sort((a, b) => Math.hypot(a.centrum.x - camera.doel.x, a.centrum.z - camera.doel.z) - Math.hypot(b.centrum.x - camera.doel.x, b.centrum.z - camera.doel.z));
      for (const g of bij.slice(0, 12)) wereld.startVerbouw(g, Math.min(5, (g.niveau ?? 1) + 1));
      stad.werkBij(1e9);
      await stad.tegels.klaar();
    }
    if (!param.has('geenverkeer')) {
      const sn = wereld.snelheid; wereld.snelheid = 1; wereld.verkeer.max = maxVerkeer();
      const n = Number(param.get('verkeer') ?? 600);
      // ?sim: de hele simulatie (ook hulpdiensten), anders alleen het verkeer.
      for (let i = 0; i < n; i++) { if (param.has('sim')) wereld.stap(0.1); else wereld.verkeer.stap(0.1); }
      wereld.snelheid = sn;
    }
    if (param.has('naauto')) {
      // Camera op een voertuig (voor controle van de modellen): ?naauto=soort,afstand,yaw,pitch
      const [soort, af, yaw, pitch] = (param.get('naauto') ?? '').split(',');
      const alle = [...wereld.verkeer.voertuigen.values()].filter(x => !soort || x.soort === soort);
      const v = alle.find(x => x.v > 3) ?? alle[0];
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
    if (verberg.includes('ui')) for (const id of ['hud', 'werkbalk', 'zoomknoppen', 'infoknoppen']) document.getElementById(id)!.style.display = 'none';
    if (verberg.includes('ui')) { hulp.style.display = 'none'; document.getElementById('nieuws')?.remove(); }
    dagNacht.stap(0, 0); lichtLaag.werkBij();
    verkeer.werkBij(sfeer.camera.position);
    for (let i = 0; i < 40; i++) straatLeven.werkBij(0.1, camera.doel, camera.afstand, 1, levenMax());
    sfeer.volg(camera.doel, camera.afstand);
    sfeer.camera.updateMatrixWorld();
    stad.tegels.kiesDetail(sfeer.camera.position);
    const t0 = performance.now();
    sfeer.render();
    if (!verberg.includes('labels')) labels.werkBij(1, camera.afstand);
    if (param.has('districten')) { werkbalk.kies('district'); }
    districtLaag.werkBij(camera.afstand);
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

  // Opslaan: knop in het menu, automatisch elke twee minuten en bij het verlaten van de pagina.
  let bezigMetOpslaan = false;
  const opslaan = async (handmatig = false) => {
    if (bezigMetOpslaan || param.has('test')) return;
    bezigMetOpslaan = true;
    try {
      await bewaar(wereld.naarJson(), { naam: wereld.naam, inwoners: wereld.stat.inwoners, datum: hud.datumTekst() });
      hud.meldOpgeslagen(`Opgeslagen om ${new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`);
      if (handmatig) gereedschap.melding = 'Stad opgeslagen';
    } catch (e) { console.warn('opslaan mislukt', e); hud.meldOpgeslagen('Opslaan lukte niet in deze browser'); }
    bezigMetOpslaan = false;
  };
  hud.opStad = wat => {
    if (wat === 'opslaan') { void opslaan(true); return; }
    if (wat === 'nieuw' && !confirm('Een nieuwe stad beginnen? Je huidige stad blijft bewaard tot je de nieuwe opslaat.')) return;
    location.search = wat === 'nieuw' ? '?nieuw=1' : '?demo=1';
  };
  setInterval(() => { if (!document.hidden) void opslaan(); }, 120_000);
  addEventListener('visibilitychange', () => { if (document.hidden) void opslaan(); });

  let vorige = performance.now(), hudKlok = 0, tijd = 0, mvVersie = -1;
  const lus = (nu: number) => {
    const dt = Math.min(0.1, (nu - vorige) / 1000);
    vorige = nu; tijd += dt;
    camera.stap(dt);
    wereld.verkeer.max = maxVerkeer();
    wereld.stap(dt);
    verkeer.werkBij(sfeer.camera.position, dt);
    straatLeven.werkBij(dt, camera.doel, camera.afstand, wereld.snelheid, levenMax());
    verkeersLaag.werkBij(camera.doel, camera.afstand);
    if (diensten.werkBij(dt, sfeer.camera, wereld.snelheid)) sfeer.schaduwVuil();
    const grond = grondOnder();
    gereedschap.kijk = { x: -Math.sin(camera.yaw), z: -Math.cos(camera.yaw) };
    if (gereedschap.modus === 'verplaats' && mv.versie !== mvVersie) { mvVersie = mv.versie; werkbalk.teken(); }
    gereedschap.beweeg(grond);
    gereedschap.stap(dt);
    const voor = stad.bezig;
    stad.tegels.lodAfstand = lodVoor(); diensten.lodAfstand = lodVoor();
    stad.werkBij(5, dt);
    if (stad.tegels.nieuw) { stad.tegels.nieuw = false; sfeer.schaduwVuil(); }
    void voor;
    regelaar.tik(dt);
    terrein.werkBij();
    terrein.tik(tijd);
    if (stad.props.werkBij(sfeer.camera.position, dt)) sfeer.schaduwVuil();
    let vb = gereedschap.voorbeeld();
    // Geselecteerd gebouw blijft gemarkeerd.
    const sel = gereedschap.selectie;
    if (vb.soort === 'geen' && sel) vb = sel.soort === 'gebouw' ? { soort: 'markeer', gebouw: sel.id, kleur: '#4dabf7', tekst: '' } : { soort: 'markeer', dienst: sel.id, kleur: '#4dabf7', tekst: '' };
    voorbeeld.toon(vb);
    const selSleutel = sel ? `${sel.soort}${sel.id}` : '';
    if (selSleutel !== selectieNu) { selectieNu = selSleutel; infoPaneel.toon(sel); }
    infoLaag.werkBij(dt);
    const tekst = vb.soort === 'weg' ? (vb.as.length ? vb.tekst : '') : vb.soort === 'markeer' || vb.soort === 'gebied' || vb.soort === 'dienst' || vb.soort === 'zoneSel' || vb.soort === 'verplaats' ? vb.tekst : '';
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
    if (hudKlok > 0.25) { hudKlok = 0; hud.werkBij(); hud.fps(regelaar); ecoPaneel.werkBij(); werkbalk.werkBijBalans(); infoPaneel.werkBij(); }
    if (dagNacht.stap(dt, wereld.snelheid)) sfeer.schaduwVuil();
    lichtLaag.werkBij();
    sfeer.volg(camera.doel, camera.afstand);
    sfeer.render();
    labels.werkBij(dt, camera.afstand);
    districtLaag.werkBij(camera.afstand);
    requestAnimationFrame(lus);
  };
  requestAnimationFrame(lus);
}

start().catch(e => { laadTekst.textContent = 'Fout: ' + (e?.message ?? e); console.error(e); });
