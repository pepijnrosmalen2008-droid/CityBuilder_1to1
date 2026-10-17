import * as THREE from 'three';
import { Wereld } from '../core/wereld';
import { bouwSegment, bouwKruispunt } from '../core/geom/wegmesh';
import { bouwGebouw } from '../core/geom/gebouwmesh';
import { BOOMSOORTEN } from '../core/bomen';
import type { Prop } from '../core/geom/mesh';
import { zoneKleur } from '../core/zones';
import { driehoeken, verfijn, afstandTotLijn } from '../core/poly';
import { Materialen } from './materialen';
import { weg, meshUitBuffers, schaduwUitBuffers } from './meshes';
import type { NaarWorker, VanWorker } from './tegelworker';
import type { MeshData } from '../core/geom/mesh';
import { PropLaag } from './props';
import { EconomieWeergave } from './economie';

const TEGEL = 256, BLOK = 512;
const vakVan = (x: number, z: number, m: number) => (Math.floor(x / m) + 100) * 1000 + (Math.floor(z / m) + 100);
const vakMidden = (v: number, m: number) => ({ x: (Math.floor(v / 1000) - 100 + 0.5) * m, z: ((v % 1000) - 100 + 0.5) * m });
/** Blok van 512 m waar een vak van 256 m in ligt. */
const blokVanVak = (v: number) => { const i = Math.floor(v / 1000) - 100, j = (v % 1000) - 100; return (Math.floor(i / 2) + 100) * 1000 + (Math.floor(j / 2) + 100); };

type Niv = 'dicht' | 'ver';

/**
 * Wegen, kruispunten, gebouwen en bedrijven per vak samengevoegd, in twee detailniveaus:
 * - dichtbij: vakken van 256 m met alle details;
 * - veraf: blokken van 512 m met de vereenvoudigde gebouwen en de textuurreeks.
 * Per blok wordt gekozen (met een marge tegen heen-en-weer wisselen). Het samenvoegen gebeurt in een
 * Web Worker: de hoofdthread stuurt alleen wijzigingen en krijgt kant-en-klare buffers terug, dus het
 * beeld hapert nooit als de stad groeit. Elk vak heeft één schaduwvervanger (één tekenopdracht).
 */
export class TegelLaag {
  groep = new THREE.Group();
  private worker = new Worker(new URL('./tegelworker.ts', import.meta.url), { type: 'module' });
  private meshes: Record<Niv, Map<number, THREE.Group>> = { dicht: new Map(), ver: new Map() };
  private vuilSet: Record<Niv, Set<number>> = { dicht: new Set(), ver: new Set() };
  /** Vakken waarvoor een opdracht bij de worker ligt (nr van de laatste opdracht). */
  private onderweg: Record<Niv, Map<number, number>> = { dicht: new Map(), ver: new Map() };
  private sleutelVak = new Map<string, { d: number; v: number }>();
  private nr = 1;
  /** Blokken die nu in de verre versie getekend worden. */
  private blokVer = new Set<number>();
  /** Afstand (m) vanaf waar een blok de verre versie krijgt; gezet per kwaliteitsniveau. */
  lodAfstand = 600;
  private verKlok = 0;
  private wachters: (() => void)[] = [];

  constructor(private mats: Materialen) {
    this.worker.onmessage = (e: MessageEvent<VanWorker>) => this.ontvang(e.data);
  }

  get vuil() { return new Set([...this.vuilSet.dicht, ...this.vuilSet.ver]); }
  /** Nog werk te doen (vuile vakken of opdrachten bij de worker). */
  get bezig() { return this.vuilSet.dicht.size + this.vuilSet.ver.size + this.onderweg.dicht.size + this.onderweg.ver.size; }
  /** Wacht tot alles is opgebouwd (laden, schermafbeeldingen). */
  klaar(): Promise<void> { return this.bezig ? new Promise(r => this.wachters.push(r)) : Promise.resolve(); }

  /** `verData`: eigen versie voor op afstand (gebouwen); anders wordt de detailversie vereenvoudigd. */
  zet(sleutel: string, x: number, z: number, data: MeshData | null, verData?: MeshData | null) {
    this.wis(sleutel);
    if (!data || !data.groepen.length) return;
    const vakD = vakVan(x, z, TEGEL), vakV = vakVan(x, z, BLOK);
    this.sleutelVak.set(sleutel, { d: vakD, v: vakV });
    const m: NaarWorker = { t: 'zet', k: sleutel, vakD, vakV, data, ver: verData ?? null };
    const lijst: Transferable[] = [];
    const gezien = new Set<ArrayBufferLike>();
    for (const md of [data, verData]) for (const g of md?.groepen ?? []) for (const a of [g.posities, g.normalen, g.uvs, g.indices, g.kleuren, g.lagen, g.rm]) if (a && !gezien.has(a.buffer)) { gezien.add(a.buffer); lijst.push(a.buffer as ArrayBuffer); }
    try { this.worker.postMessage(m, lijst); } catch { this.worker.postMessage(m); }
    this.vuilSet.dicht.add(vakD); this.vuilSet.ver.add(vakV);
  }
  wis(sleutel: string) {
    const v = this.sleutelVak.get(sleutel);
    if (!v) return;
    this.sleutelVak.delete(sleutel);
    this.worker.postMessage({ t: 'wis', k: sleutel } as NaarWorker);
    this.vuilSet.dicht.add(v.d); this.vuilSet.ver.add(v.v);
  }

  private ontvang(r: VanWorker) {
    if (this.onderweg[r.niv].get(r.vak) !== r.nr) { this.check(); return; } // er is al een nieuwere opdracht
    this.onderweg[r.niv].delete(r.vak);
    const oud = this.meshes[r.niv].get(r.vak);
    if (oud) { weg(oud); this.meshes[r.niv].delete(r.vak); }
    if (r.geo) {
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      const m = meshUitBuffers(r.geo, this.mats);
      g.add(m);
      if (r.geo.schaduw) g.add(schaduwUitBuffers(r.geo.schaduw));
      const blok = r.niv === 'dicht' ? blokVanVak(r.vak) : r.vak;
      g.visible = r.niv === 'ver' ? this.blokVer.has(blok) : !this.blokVer.has(blok);
      this.meshes[r.niv].set(r.vak, g);
      this.groep.add(g);
    }
    this.nieuw = true;
    this.check();
  }
  /** Er is net een vak bijgewerkt (de schaduw moet opnieuw). */
  nieuw = false;
  private check() { if (!this.bezig) { const w = this.wachters; this.wachters = []; for (const f of w) f(); } }

  private vraag(niv: Niv, vak: number) {
    this.vuilSet[niv].delete(vak);
    const nr = this.nr++;
    this.onderweg[niv].set(vak, nr);
    this.worker.postMessage({ t: 'bouw', niv, vak, nr } as NaarWorker);
  }

  /**
   * Vuile vakken naar de worker sturen: eerst dichtbij (op afstand gesorteerd, hooguit 3 tegelijk),
   * daarna rustig de verre blokken (één per 0,4 s): die zie je pas van ver. `max` = alles meteen (laden).
   */
  bouw(max = 3, cam?: { x: number; z: number }, _budgetMs = 4, dt = 0.016) {
    void _budgetMs;
    this.verKlok += dt;
    const alles = max > 1e6;
    const sorteer = (niv: Niv, maat: number) => { let l = [...this.vuilSet[niv]]; if (cam) l = l.sort((a, b) => { const p = vakMidden(a, maat), q = vakMidden(b, maat); return Math.hypot(p.x - cam.x, p.z - cam.z) - Math.hypot(q.x - cam.x, q.z - cam.z); }); return l; };
    for (const v of sorteer('dicht', TEGEL)) { if (!alles && this.onderweg.dicht.size >= 3) break; if (this.onderweg.dicht.has(v) && !alles) continue; this.vraag('dicht', v); }
    for (const v of sorteer('ver', BLOK)) {
      if (!alles && (this.onderweg.ver.size >= 1 || this.verKlok < 0.4 || this.vuilSet.dicht.size)) break;
      this.verKlok = 0;
      this.vraag('ver', v);
    }
  }

  /**
   * Per blok kiezen tussen dichtbij en veraf, op afstand tot de camera (met 15% marge tegen
   * heen-en-weer schakelen). De wissel valt ver weg en het silhouet blijft gelijk: je merkt hem niet.
   */
  kiesDetail(cam: THREE.Vector3) {
    const blokken = new Set<number>([...this.meshes.ver.keys(), ...[...this.meshes.dicht.keys()].map(blokVanVak)]);
    for (const b of blokken) {
      const m = vakMidden(b, BLOK);
      const dx = Math.max(0, Math.abs(cam.x - m.x) - BLOK / 2), dz = Math.max(0, Math.abs(cam.z - m.z) - BLOK / 2);
      const d = Math.hypot(dx, dz, cam.y);
      const nu = this.blokVer.has(b);
      // Alleen naar veraf als die versie er al is (anders zou er even niets staan).
      const ver = (nu ? d > this.lodAfstand * 0.85 : d > this.lodAfstand * 1.15) && this.meshes.ver.has(b);
      if (ver === nu) continue;
      if (ver) this.blokVer.add(b); else this.blokVer.delete(b);
      const vm = this.meshes.ver.get(b); if (vm) vm.visible = ver;
      for (const [v, g] of this.meshes.dicht) if (blokVanVak(v) === b) g.visible = !ver;
    }
  }
}

/** Houdt de three.js-scène gelijk met de wereld (luistert naar de wereld-events). */
export class StadWeergave {
  groep = new THREE.Group();
  tegels: TegelLaag;
  props: PropLaag;
  economie: EconomieWeergave;
  zones: ZoneLaag;
  private bouwRij = new Set<number>();
  private segRij = new Set<number>();
  private knoopRij = new Set<number>();

  constructor(private w: Wereld, mats: Materialen) {
    this.props = new PropLaag(mats);
    this.zones = new ZoneLaag(w);
    this.tegels = new TegelLaag(mats);
    this.economie = new EconomieWeergave(w, this.tegels, this.props);
    this.groep.add(this.props.groep, this.zones.mesh, this.tegels.groep, this.economie.groep);
    for (const v of w.bomen.alleVakken()) this.natuur(v);
  }

  private natuur(vak: number) {
    const b = this.w.bomen;
    const props: Prop[] = b.inVak(vak).map(i => ({ soort: BOOMSOORTEN[b.soort[i]], x: b.x[i], y: this.w.terrein.hoogte(b.x[i], b.z[i]), z: b.z[i], rot: b.rot[i], schaal: b.schaal[i], variant: b.variant[i] }));
    this.props.zet(`bos:${vak}`, props);
  }

  /** Verwerk wereld-events; zware herbouw wordt over frames verdeeld. */
  /** Camera (voor de volgorde van opbouwen en de keuze van het detailniveau). */
  cam: THREE.Vector3 | null = null;

  private distVersie = -1;
  private distKlok = 0;

  werkBij(budgetMs = 8, dt = 0.016) {
    for (const e of this.w.haalEvents()) {
      switch (e.soort) {
        case 'seg+': this.segRij.add(e.id); break;
        case 'seg-': this.tegels.wis(`weg:${e.id}`); this.props.wis(`weg:${e.id}`); this.segRij.delete(e.id); break;
        case 'knoop~': this.knoopRij.add(e.id); break;
        case 'kavel+': case 'kavel-': case 'kavel~': this.zones.vuil = true; break;
        case 'gebouw+': case 'gebouw~': this.bouwRij.add(e.id); break;
        case 'gebouw-': this.tegels.wis(`geb:${e.id}`); this.props.wis(`geb:${e.id}`); this.bouwRij.delete(e.id); break;
      }
    }
    // Districten veranderd (stijl bepaalt de lantaarns): wegen opnieuw, als het schilderen even stilligt.
    if (this.w.districten.versie !== this.distVersie) { this.distVersie = this.w.districten.versie; this.distKlok = 1.2; }
    if (this.distKlok > 0) { this.distKlok -= dt; if (this.distKlok <= 0) for (const id of this.w.net.segmenten.keys()) this.segRij.add(id); }
    // Verkeersregels die het wegdek veranderen (borden, pijlen, oversteekplaatsen, lichten).
    const rv = this.w.net.regels.haalVuil();
    for (const id of rv.segs) this.segRij.add(id);
    for (const k of rv.knopen) for (const sid of this.w.net.knopen.get(k)?.segs ?? []) this.segRij.add(sid);
    for (const v of this.w.bomen.haalVuileVakken()) this.natuur(v);
    const start = performance.now();
    // Wegen en kruispunten eerst (die zie je meteen na het klikken).
    for (const id of this.segRij) {
      this.segRij.delete(id);
      const seg = this.w.net.segmenten.get(id);
      if (!seg) { this.tegels.wis(`weg:${id}`); continue; }
      const r = bouwSegment(this.w.net, seg);
      const m = seg.pad[Math.floor(seg.pad.length / 2)];
      this.tegels.zet(`weg:${id}`, m.x, m.z, r.mesh);
      this.props.zet(`weg:${id}`, r.props);
    }
    for (const id of this.knoopRij) {
      this.knoopRij.delete(id);
      const k = this.w.net.knopen.get(id);
      if (!k) { this.tegels.wis(`kp:${id}`); continue; }
      this.tegels.zet(`kp:${id}`, k.p.x, k.p.z, bouwKruispunt(this.w.net, id));
    }
    for (const id of this.bouwRij) {
      if (performance.now() - start > budgetMs) break;
      this.bouwRij.delete(id);
      const g = this.w.gebouwen.get(id);
      if (!g) { this.tegels.wis(`geb:${id}`); continue; }
      // Buurgebouwen waarvan het grondvlak op dit perceel kan liggen.
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const p of g.perceel) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      const buren: { x: number; z: number }[][] = [];
      for (const o of this.w.gebouwen.values()) {
        if (o === g || Math.abs(o.centrum.x - (x0 + x1) / 2) > 120 || Math.abs(o.centrum.z - (z0 + z1) / 2) > 120) continue;
        if (o.voet.some(p => p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) || o.voet.every(p => p.x < x0) === false && o.voet.every(p => p.x > x1) === false && o.voet.every(p => p.z < z0) === false && o.voet.every(p => p.z > z1) === false) buren.push(o.voet);
      }
      const h = (x: number, z: number) => this.w.terrein.hoogte(x, z);
      const r = bouwGebouw(g, h, buren);
      this.tegels.zet(`geb:${id}`, g.centrum.x, g.centrum.z, r.mesh, bouwGebouw(g, h, buren, true).mesh);
      this.props.zet(`geb:${id}`, r.props);
    }
    this.economie.werkBij();
    this.tegels.bouw(budgetMs > 100 ? 1e9 : 3, this.cam ?? undefined, budgetMs > 100 ? 1e9 : 4, dt);
    if (this.cam) this.tegels.kiesDetail(this.cam);
    this.zones.werkBij();
  }

  get bezig() { return this.bouwRij.size + this.segRij.size + this.tegels.bezig; }
}

/** Zonekleuren op de kavels: zacht getint op lege gezoneerde kavels, met raster in de zonemodus. */
export class ZoneLaag {
  mesh: THREE.Mesh;
  vuil = true;
  toonAlles = false;
  private mat: THREE.ShaderMaterial;

  constructor(private w: Wereld) {
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
      uniforms: { uAlles: { value: 0 } },
      vertexShader: `attribute vec4 kleur; varying vec4 vK; varying vec2 vUv;
        void main(){ vK = kleur; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uAlles; varying vec4 vK; varying vec2 vUv;
        void main(){
          float lijn = 1.0 - smoothstep(0.25, 0.7, vUv.y);
          float a = vK.a * mix(0.2, 0.42, uAlles) + lijn * mix(0.12, 0.5, uAlles) * step(0.001, vK.a);
          gl_FragColor = vec4(mix(vK.rgb, vec3(1.0), lijn * 0.5), a);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.renderOrder = 2;
    this.mesh.userData.geenAO = true;
    this.mesh.frustumCulled = false;
  }

  werkBij() {
    this.mat.uniforms.uAlles.value = this.toonAlles ? 1 : 0;
    // Zoals in CS2: lege zones alleen tonen als je aan het zoneren bent.
    this.mesh.visible = this.toonAlles;
    if (!this.vuil) return;
    this.vuil = false;
    const pos: number[] = [], uv: number[] = [], kl: number[] = [], idx: number[] = [];
    const t = this.w.terrein;
    const c = new THREE.Color();
    for (const k of this.w.kavels.values()) {
      if (k.gebouw) continue;
      if (k.zone === 'geen' && !this.toonAlles) continue;
      if (k.zone === 'geen') c.set('#ffffff'); else c.set(zoneKleur(k.zone));
      const alfa = k.zone === 'geen' ? 0.25 : 1;
      const v = verfijn(k.poly, driehoeken(k.poly), 4, (x, z) => t.hoogte(x, z));
      const o = pos.length / 3;
      for (const p of v.p) {
        pos.push(p.x, t.hoogte(p.x, p.z) + 0.12, p.z);
        // UV.y: afstand tot de perceelgrens (voor de omlijning).
        uv.push(0, afstandTotLijn(p, [...k.poly, k.poly[0]]).d);
        kl.push(c.r, c.g, c.b, alfa);
      }
      for (let i = 0; i < v.tri.length; i += 3) idx.push(o + v.tri[i], o + v.tri[i + 1], o + v.tri[i + 2]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('kleur', new THREE.Float32BufferAttribute(kl, 4));
    g.setIndex(idx);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }
}

