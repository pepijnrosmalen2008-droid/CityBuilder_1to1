import * as THREE from 'three';
import { Wereld } from '../core/wereld';
import { CEL } from '../core/districten';

/**
 * Districten op de kaart, zoals in Cities: Skylines: in de districtsmodus een gekleurde laag met
 * een duidelijke rand; altijd de namen, groot op de grond als je verder uitzoomt.
 */
export class DistrictLaag {
  groep = new THREE.Group();
  private mesh: THREE.Mesh | null = null;
  private versie = -1;
  private aan = false;
  private labels = document.createElement('div');
  private pool = new Map<number, HTMLElement>();
  private middens = new Map<number, { x: number; z: number } | null>();
  private middenVersie = -1;
  private mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 });

  constructor(private w: Wereld, private cam: THREE.PerspectiveCamera) {
    this.labels.id = 'districtlabels';
    document.body.appendChild(this.labels);
    this.groep.renderOrder = 4;
  }

  toon(aan: boolean) { this.aan = aan; if (this.mesh) this.mesh.visible = aan; }

  private bouw() {
    const ds = this.w.districten, t = this.w.terrein;
    const pos: number[] = [], col: number[] = [];
    const c = new THREE.Color();
    const y = (x: number, z: number) => Math.max(t.hoogte(x, z), 0) + 0.7;
    const quad = (a: [number, number], b: [number, number], cc: [number, number], d: [number, number], alfa: number) => {
      for (const [x, z] of [a, b, cc, a, cc, d]) { pos.push(x, y(x, z), z); col.push(c.r, c.g, c.b, alfa); }
    };
    const raster = ds.raster;
    const id = (i: number, j: number) => raster.get((i + 5000) * 10000 + (j + 5000)) ?? 0;
    for (const v of ds.vakjes()) {
      const d = ds.lijst.get(v.id);
      if (!d) continue;
      c.set(d.kleur);
      const x0 = v.i * CEL, z0 = v.j * CEL, x1 = x0 + CEL, z1 = z0 + CEL;
      quad([x0, z0], [x1, z0], [x1, z1], [x0, z1], 0.22);
      // Rand waar het buurvakje bij een ander district hoort.
      const r = 1.6;
      if (id(v.i - 1, v.j) !== v.id) quad([x0, z0], [x0 + r, z0], [x0 + r, z1], [x0, z1], 0.9);
      if (id(v.i + 1, v.j) !== v.id) quad([x1 - r, z0], [x1, z0], [x1, z1], [x1 - r, z1], 0.9);
      if (id(v.i, v.j - 1) !== v.id) quad([x0, z0], [x1, z0], [x1, z0 + r], [x0, z0 + r], 0.9);
      if (id(v.i, v.j + 1) !== v.id) quad([x0, z1 - r], [x1, z1 - r], [x1, z1], [x0, z1], 0.9);
    }
    if (this.mesh) { this.groep.remove(this.mesh); this.mesh.geometry.dispose(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.visible = this.aan; this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.userData.geenAO = true;
    this.groep.add(this.mesh);
  }

  werkBij(afstand: number) {
    const ds = this.w.districten;
    if (ds.versie !== this.versie) { this.versie = ds.versie; this.bouw(); }
    // Namen: in de districtsmodus altijd, anders alleen verder uitgezoomd (zoals CS).
    const zicht = this.aan || afstand > 320;
    const v = new THREE.Vector3();
    const gezien = new Set<number>();
    if (this.middenVersie !== ds.versie) { this.middenVersie = ds.versie; this.middens = new Map([...ds.lijst.keys()].map(id => [id, ds.midden(id)])); }
    if (zicht) for (const d of ds.lijst.values()) {
      const m = this.middens.get(d.id);
      if (!m) continue;
      v.set(m.x, Math.max(this.w.terrein.hoogte(m.x, m.z), 0) + 2, m.z).project(this.cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      let el = this.pool.get(d.id);
      if (!el) { el = document.createElement('div'); el.className = 'district-label'; this.labels.appendChild(el); this.pool.set(d.id, el); }
      if (el.textContent !== d.naam) el.textContent = d.naam;
      el.style.setProperty('--kleur', d.kleur);
      el.style.transform = `translate(${(v.x + 1) / 2 * innerWidth}px, ${(1 - v.y) / 2 * innerHeight}px) translate(-50%, -50%)`;
      el.style.opacity = this.aan ? '1' : String(Math.min(1, (afstand - 320) / 150));
      el.style.display = 'block';
      gezien.add(d.id);
    }
    for (const [id, el] of this.pool) if (!gezien.has(id)) { if (!ds.lijst.has(id)) { el.remove(); this.pool.delete(id); } else el.style.display = 'none'; }
  }
}
