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
import { PropLaag } from './props';

/** Houdt de three.js-scène gelijk met de wereld (luistert naar de wereld-events). */
export class StadWeergave {
  groep = new THREE.Group();
  wegen = new Map<number, THREE.Mesh>();
  kruispunten = new Map<number, THREE.Mesh>();
  gebouwen = new Map<number, THREE.Mesh>();
  props: PropLaag;
  zones: ZoneLaag;
  private bouwRij = new Set<number>();
  private segRij = new Set<number>();
  private knoopRij = new Set<number>();

  constructor(private w: Wereld, private mats: Materialen) {
    this.props = new PropLaag(mats);
    this.zones = new ZoneLaag(w);
    this.groep.add(this.props.groep, this.zones.mesh);
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
        case 'seg-': weg(this.wegen.get(e.id)); this.wegen.delete(e.id); this.props.wis(`weg:${e.id}`); this.segRij.delete(e.id); break;
        case 'knoop~': this.knoopRij.add(e.id); break;
        case 'kavel+': case 'kavel-': case 'kavel~': this.zones.vuil = true; break;
        case 'gebouw+': case 'gebouw~': this.bouwRij.add(e.id); break;
        case 'gebouw-': weg(this.gebouwen.get(e.id)); this.gebouwen.delete(e.id); this.props.wis(`geb:${e.id}`); this.bouwRij.delete(e.id); break;
      }
    }
    for (const v of this.w.bomen.haalVuileVakken()) this.natuur(v);
    const start = performance.now();
    // Wegen en kruispunten eerst (die zie je meteen na het klikken).
    for (const id of this.segRij) {
      this.segRij.delete(id);
      const seg = this.w.net.segmenten.get(id);
      weg(this.wegen.get(id)); this.wegen.delete(id);
      if (!seg) continue;
      const r = bouwSegment(this.w.net, seg);
      const m = naarMesh(r.mesh, this.mats, true, `weg ${id}`);
      if (m) { this.wegen.set(id, m); this.groep.add(m); }
      this.props.zet(`weg:${id}`, r.props);
    }
    for (const id of this.knoopRij) {
      this.knoopRij.delete(id);
      weg(this.kruispunten.get(id)); this.kruispunten.delete(id);
      if (!this.w.net.knopen.has(id)) continue;
      const m = naarMesh(bouwKruispunt(this.w.net, id), this.mats, true, `kruispunt ${id}`);
      if (m) { this.kruispunten.set(id, m); this.groep.add(m); }
    }
    for (const id of this.bouwRij) {
      if (performance.now() - start > budgetMs) break;
      this.bouwRij.delete(id);
      const g = this.w.gebouwen.get(id);
      weg(this.gebouwen.get(id)); this.gebouwen.delete(id);
      if (!g) continue;
      const r = bouwGebouw(g, (x, z) => this.w.terrein.hoogte(x, z));
      const m = naarMesh(r.mesh, this.mats, true, `gebouw ${id} ${g.vorm}`);
      if (m) { this.gebouwen.set(id, m); this.groep.add(m); }
      this.props.zet(`geb:${id}`, r.props);
    }
    this.zones.werkBij();
  }

  get bezig() { return this.bouwRij.size + this.segRij.size; }
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

