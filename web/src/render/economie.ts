import * as THREE from 'three';
import { Wereld } from '../core/wereld';
import { GRONDSTOFFEN, Grondstof, rijkdom } from '../core/economie';
import { bouwVelden, bouwBedrijf } from '../core/geom/economiemesh';
import { driehoeken } from '../core/poly';

type Zet = (sleutel: string, x: number, z: number, data: import('../core/geom/mesh').MeshData | null) => void;
type Props = { zet: (eigenaar: string, props: import('../core/geom/mesh').Prop[]) => void; wis: (eigenaar: string) => void };

/** Gebieden (omlijning), akkers, winningsbedrijven en de grondstoffenkaart. */
export class EconomieWeergave {
  groep = new THREE.Group();
  private randen = new Map<number, THREE.Object3D>();
  private kaart: THREE.Mesh;
  private kaartSoort: Grondstof | null = null;

  constructor(private w: Wereld, private tegels: { zet: Zet; wis: (k: string) => void }, private props: Props) {
    this.kaart = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, opacity: 1 }));
    this.kaart.renderOrder = 3; this.kaart.visible = false; this.kaart.userData.geenAO = true; this.kaart.frustumCulled = false;
    this.groep.add(this.kaart);
  }

  werkBij() {
    const e = this.w.economie;
    const h = (x: number, z: number) => this.w.terrein.hoogte(x, z);
    for (const ev of e.haalEvents()) {
      if (ev.soort === 'gebied+' || ev.soort === 'gebied-') {
        const g = e.gebieden.get(ev.id);
        this.rand(ev.id);
        if (g) this.velden(ev.id); else this.tegels.wis(`velden:${ev.id}`);
      } else {
        const b = e.bedrijven.get(ev.id);
        if (!b) { this.tegels.wis(`bedr:${ev.id}`); this.props.wis(`bedr:${ev.id}`); continue; }
        const g = e.gebieden.get(b.gebied)!;
        const r = bouwBedrijf(b, g, h);
        this.tegels.zet(`bedr:${b.id}`, b.p.x, b.p.z, r.mesh);
        this.props.zet(`bedr:${b.id}`, r.props);
        if (b.soort === 'landbouw') this.velden(b.gebied);
      }
    }
  }

  private velden(id: number) {
    const g = this.w.economie.gebieden.get(id);
    if (!g || g.soort !== 'landbouw') return;
    const c = g.poly[0];
    this.tegels.zet(`velden:${id}`, c.x, c.z, bouwVelden(g, (x, z) => this.w.terrein.hoogte(x, z)));
  }

  /** Gekleurde omlijning en een vleugje kleur over het gebied. */
  private rand(id: number) {
    const oud = this.randen.get(id);
    if (oud) { this.groep.remove(oud); oud.traverse(o => (o as THREE.Mesh).geometry?.dispose()); this.randen.delete(id); }
    const g = this.w.economie.gebieden.get(id);
    if (!g) return;
    const kleur = new THREE.Color(GRONDSTOFFEN[g.soort].kleur);
    const t = this.w.terrein;
    const pts: number[] = [];
    for (let i = 0; i <= g.poly.length; i++) {
      const a = g.poly[i % g.poly.length], b = g.poly[(i + 1) % g.poly.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 8));
      for (let k = 0; k < n && i < g.poly.length; k++) { const x = a.x + (b.x - a.x) * k / n, z = a.z + (b.z - a.z) * k / n; pts.push(x, t.hoogte(x, z) + 0.6, z); }
    }
    pts.push(pts[0], pts[1], pts[2]);
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lijn = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: kleur, transparent: true, opacity: 0.9 }));
    const tri = driehoeken(g.poly);
    const fp: number[] = [];
    for (const i of tri) { const p = g.poly[i]; fp.push(p.x, t.hoogte(p.x, p.z) + 0.3, p.z); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    const vlak = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }));
    const groep = new THREE.Group(); groep.add(lijn, vlak);
    groep.userData.geenAO = true; lijn.userData.geenAO = true; vlak.userData.geenAO = true;
    this.randen.set(id, groep); this.groep.add(groep);
  }

  /** Grondstoffenkaart (warmtekaart van de rijkdom) tonen of verbergen. */
  toonKaart(soort: Grondstof | null) {
    this.kaart.visible = !!soort;
    if (!soort || soort === this.kaartSoort) return;
    this.kaartSoort = soort;
    const t = this.w.terrein, N = 128, g = t.grootte, stap = g / N;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const c = new THREE.Color(GRONDSTOFFEN[soort].kleur);
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = -g / 2 + i * stap, z = -g / 2 + j * stap;
      const r = rijkdom(t, soort, x, z);
      pos.push(x, Math.max(t.hoogte(x, z), 0) + 0.8, z);
      col.push(c.r, c.g, c.b, Math.min(0.62, r * 0.75));
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i; idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    geo.setIndex(idx);
    this.kaart.geometry.dispose(); this.kaart.geometry = geo;
  }
}
