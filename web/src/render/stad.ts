import * as THREE from 'three';
import { Wereld } from '../core/wereld';
import { bouwSegment, bouwKruispunt } from '../core/geom/wegmesh';
import { bouwGebouw } from '../core/geom/gebouwmesh';
import { BOOMSOORTEN } from '../core/bomen';
import type { Prop } from '../core/geom/mesh';
import { zoneKleur } from '../core/zones';
import { driehoeken, verfijn, afstandTotLijn } from '../core/poly';
import { Materialen } from './materialen';
import { naarMesh, weg } from './meshes';
import { samenvoegen, MeshData } from '../core/geom/mesh';
import { PropLaag } from './props';
import { EconomieWeergave } from './economie';

const TEGEL = 256;
const tegelVan = (x: number, z: number) => (Math.floor(x / TEGEL) + 100) * 1000 + (Math.floor(z / TEGEL) + 100);

/**
 * Alle wegen, kruispunten en gebouwen van één vak van 256 m samengevoegd tot één mesh met één
 * groep per materiaal. Duizenden losse meshes kosten duizenden tekenopdrachten; zo blijven er
 * per vak een paar tientallen over.
 */
export class TegelLaag {
  groep = new THREE.Group();
  private bron = new Map<string, { tegel: number; data: MeshData }>();
  private inhoud = new Map<number, Set<string>>();
  private meshes = new Map<number, THREE.Mesh>();
  vuil = new Set<number>();
  constructor(private mats: Materialen) {}

  zet(sleutel: string, x: number, z: number, data: MeshData | null) {
    this.wis(sleutel);
    if (!data || !data.groepen.length) return;
    const t = tegelVan(x, z);
    this.bron.set(sleutel, { tegel: t, data });
    let s = this.inhoud.get(t); if (!s) this.inhoud.set(t, s = new Set()); s.add(sleutel);
    this.vuil.add(t);
  }
  wis(sleutel: string) {
    const b = this.bron.get(sleutel);
    if (!b) return;
    this.bron.delete(sleutel); this.inhoud.get(b.tegel)?.delete(sleutel); this.vuil.add(b.tegel);
  }
  /** Vuile vakken samenvoegen; `max` vakken per keer. */
  bouw(max = 3) {
    let n = 0;
    for (const t of this.vuil) {
      if (n++ >= max) break;
      this.vuil.delete(t);
      weg(this.meshes.get(t)); this.meshes.delete(t);
      const delen = [...(this.inhoud.get(t) ?? [])].map(k => this.bron.get(k)!.data);
      if (!delen.length) continue;
      const m = naarMesh(samenvoegen(delen), this.mats, true, `vak ${t}`);
      if (m) { this.meshes.set(t, m); this.groep.add(m); }
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
      const r = bouwGebouw(g, (x, z) => this.w.terrein.hoogte(x, z), buren);
      this.tegels.zet(`geb:${id}`, g.centrum.x, g.centrum.z, r.mesh);
      this.props.zet(`geb:${id}`, r.props);
    }
    this.economie.werkBij();
    this.tegels.bouw(budgetMs > 100 ? 1e9 : 3);
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
      const v = verfijn(k.poly, driehoeken(k.poly), 4);
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

