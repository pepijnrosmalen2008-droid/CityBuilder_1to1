import * as THREE from 'three';
import { Wereld } from '../core/wereld';
import { bouwSegment, bouwKruispunt } from '../core/geom/wegmesh';
import { bouwGebouw } from '../core/geom/gebouwmesh';
import { BOOMSOORTEN } from '../core/bomen';
import type { Prop } from '../core/geom/mesh';
import { zoneKleur } from '../core/zones';
import { driehoeken, verfijn, afstandTotLijn } from '../core/poly';
import { Materialen } from './materialen';
import { naarMesh, weg, schaduwMesh } from './meshes';
import { vereenvoudig, effenSamen } from '../core/geom/lod';
import { samenvoegen, MeshData } from '../core/geom/mesh';
import { PropLaag } from './props';
import { EconomieWeergave } from './economie';

const TEGEL = 256, BLOK = 512;
const vakVan = (x: number, z: number, m: number) => (Math.floor(x / m) + 100) * 1000 + (Math.floor(z / m) + 100);
const vakMidden = (v: number, m: number) => ({ x: (Math.floor(v / 1000) - 100 + 0.5) * m, z: ((v % 1000) - 100 + 0.5) * m });
/** Blok van 512 m waar een vak van 256 m in ligt. */
const blokVanVak = (v: number) => { const i = Math.floor(v / 1000) - 100, j = (v % 1000) - 100; return (Math.floor(i / 2) + 100) * 1000 + (Math.floor(j / 2) + 100); };

interface Niveau {
  maat: number;
  bron: Map<string, { vak: number; data: MeshData }>;
  inhoud: Map<number, Set<string>>;
  meshes: Map<number, THREE.Group>;
  vuil: Set<number>;
}

/**
 * Wegen, kruispunten, gebouwen en bedrijven per vak samengevoegd, in twee detailniveaus:
 * - dichtbij: vakken van 256 m met alle details;
 * - veraf: blokken van 512 m met de vereenvoudigde gebouwen en samengevoegde effen materialen.
 * Per blok wordt gekozen (met een marge tegen heen-en-weer wisselen). Elk vak heeft daarnaast één
 * schaduwvervanger: de schaduwpass kost dan één tekenopdracht per vak in plaats van tientallen.
 */
export class TegelLaag {
  groep = new THREE.Group();
  private dicht: Niveau = { maat: TEGEL, bron: new Map(), inhoud: new Map(), meshes: new Map(), vuil: new Set() };
  private ver: Niveau = { maat: BLOK, bron: new Map(), inhoud: new Map(), meshes: new Map(), vuil: new Set() };
  /** Blokken die nu in de verre versie getekend worden. */
  private blokVer = new Set<number>();
  /** Afstand (m) vanaf waar een blok de verre versie krijgt; gezet per kwaliteitsniveau. */
  lodAfstand = 600;
  constructor(private mats: Materialen) {}

  get vuil() { return new Set([...this.dicht.vuil, ...this.ver.vuil]); }

  /** `verData`: eigen versie voor op afstand (gebouwen); anders wordt de detailversie vereenvoudigd. */
  zet(sleutel: string, x: number, z: number, data: MeshData | null, verData?: MeshData | null) {
    this.wis(sleutel);
    if (!data || !data.groepen.length) return;
    this.zetIn(this.dicht, sleutel, x, z, data);
    const v = vereenvoudig(verData ?? data);
    if (v.groepen.length) this.zetIn(this.ver, sleutel, x, z, v);
  }
  private zetIn(n: Niveau, sleutel: string, x: number, z: number, data: MeshData) {
    const v = vakVan(x, z, n.maat);
    n.bron.set(sleutel, { vak: v, data });
    let s = n.inhoud.get(v); if (!s) n.inhoud.set(v, s = new Set()); s.add(sleutel);
    n.vuil.add(v);
  }
  wis(sleutel: string) {
    for (const n of [this.dicht, this.ver]) {
      const b = n.bron.get(sleutel);
      if (!b) continue;
      n.bron.delete(sleutel); n.inhoud.get(b.vak)?.delete(sleutel); n.vuil.add(b.vak);
    }
  }

  private bouwVak(n: Niveau, v: number) {
    const oud = n.meshes.get(v);
    if (oud) { weg(oud); n.meshes.delete(v); }
    const delen = [...(n.inhoud.get(v) ?? [])].map(k => n.bron.get(k)!.data);
    if (!delen.length) return;
    const data = n === this.dicht ? effenSamen(samenvoegen(delen)) : samenvoegen(delen);
    const m = naarMesh(data, this.mats, false, `vak ${v}`);
    if (!m) return;
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    g.add(m);
    const sch = schaduwMesh(data);
    if (sch) g.add(sch);
    const blok = n === this.dicht ? blokVanVak(v) : v;
    g.visible = n === this.ver ? this.blokVer.has(blok) : !this.blokVer.has(blok);
    n.meshes.set(v, g);
    this.groep.add(g);
  }

  /** Vuile vakken samenvoegen; `max` per keer (dichtbij eerst: die zie je het best). */
  bouw(max = 3, cam?: { x: number; z: number }) {
    let n = 0;
    for (const niv of [this.dicht, this.ver]) {
      let lijst = [...niv.vuil];
      if (cam) lijst = lijst.sort((a, b) => { const p = vakMidden(a, niv.maat), q = vakMidden(b, niv.maat); return Math.hypot(p.x - cam.x, p.z - cam.z) - Math.hypot(q.x - cam.x, q.z - cam.z); });
      for (const v of lijst) {
        if (n++ >= max) return;
        niv.vuil.delete(v);
        this.bouwVak(niv, v);
      }
    }
  }

  /**
   * Per blok kiezen tussen dichtbij en veraf, op afstand tot de camera (met 15% marge tegen
   * heen-en-weer schakelen). De wissel valt ver weg en het silhouet blijft gelijk: je merkt hem niet.
   */
  kiesDetail(cam: THREE.Vector3) {
    const blokken = new Set<number>([...this.ver.meshes.keys(), ...[...this.dicht.meshes.keys()].map(blokVanVak)]);
    for (const b of blokken) {
      const m = vakMidden(b, BLOK);
      // Afstand tot de rand van het blok (niet het midden), en de camerahoogte telt mee.
      const dx = Math.max(0, Math.abs(cam.x - m.x) - BLOK / 2), dz = Math.max(0, Math.abs(cam.z - m.z) - BLOK / 2);
      const d = Math.hypot(dx, dz, cam.y);
      const nu = this.blokVer.has(b);
      const ver = nu ? d > this.lodAfstand * 0.85 : d > this.lodAfstand * 1.15;
      if (ver === nu) continue;
      if (ver) this.blokVer.add(b); else this.blokVer.delete(b);
      const vm = this.ver.meshes.get(b); if (vm) vm.visible = ver;
      for (const [v, g] of this.dicht.meshes) if (blokVanVak(v) === b) g.visible = !ver;
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

  werkBij(budgetMs = 8) {
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
    this.tegels.bouw(budgetMs > 100 ? 1e9 : 3, this.cam ?? undefined);
    if (this.cam) this.tegels.kiesDetail(this.cam);
    this.zones.werkBij();
  }

  get bezig() { return this.bouwRij.size + this.segRij.size + this.tegels.vuil.size; }
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

