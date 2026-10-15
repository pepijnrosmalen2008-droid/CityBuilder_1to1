import * as THREE from 'three';
import { Wereld, Gebouw, totaleHoogte } from '../core/wereld';
import type { Segment } from '../core/wegen/netwerk';

/** Straatnamen op de kaart, zoals in Cities: Skylines: alleen dichtbij, langs de weg gedraaid. */
export class StraatLabels {
  private laag = document.createElement('div');
  private pool: HTMLElement[] = [];
  private klok = 0;
  private raster = new Map<number, { g: Gebouw; top: number }[]>();
  private rasterKlok = 99;

  constructor(private w: Wereld, private cam: THREE.PerspectiveCamera) {
    this.laag.id = 'labels';
    document.body.appendChild(this.laag);
  }

  /** Gebouwen per vak van 40 m, om te kunnen zien of een naam achter een gebouw valt. */
  private bouwRaster() {
    this.raster.clear();
    for (const g of this.w.gebouwen.values()) {
      if (!g.voet.length) continue;
      const top = g.y + totaleHoogte(g.lagen) * Math.max(0.15, g.klaar ? 1 : g.voortgang) + (g.dak ? 3 : 1);
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const p of g.voet) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      for (let i = Math.floor(x0 / 40); i <= Math.floor(x1 / 40); i++) for (let j = Math.floor(z0 / 40); j <= Math.floor(z1 / 40); j++) {
        const k = (i + 5000) * 10000 + j + 5000;
        let l = this.raster.get(k); if (!l) this.raster.set(k, l = []); l.push({ g, top });
      }
    }
  }

  /** Ligt dit punt (vanaf de camera gezien) achter een gebouw? Langs de kijklijn een paar meter per stap. */
  private bedekt(x: number, y: number, z: number): boolean {
    const c = this.cam.position, dx = c.x - x, dy = c.y - y, dz = c.z - z, L = Math.hypot(dx, dy, dz);
    for (let t = 3; t < L; t += 4) {
      const qx = x + dx * t / L, qy = y + dy * t / L, qz = z + dz * t / L;
      if (qy > 200) break;
      const l = this.raster.get((Math.floor(qx / 40) + 5000) * 10000 + Math.floor(qz / 40) + 5000);
      if (!l) continue;
      for (const { g, top } of l) if (qy < top && qy > g.y - 1 && binnen(qx, qz, g.voet)) return true;
    }
    return false;
  }

  werkBij(dt: number, afstand: number, zichtbaar = true) {
    this.klok += dt;
    this.rasterKlok += dt;
    if (this.klok < 0.08) return;
    this.klok = 0;
    let n = 0;
    if (zichtbaar && afstand < 650) {
      if (this.rasterKlok > 1) { this.rasterKlok = 0; this.bouwRaster(); }
      // Per straatnaam het langste zichtbare segment.
      const beste = new Map<string, { s: Segment; d: number }>();
      const cp = this.cam.position;
      const v = new THREE.Vector3(), v2 = new THREE.Vector3();
      for (const s of this.w.net.segmenten.values()) {
        if (!s.naam || s.lengte < 25 || !s.pad.length) continue;
        const m = s.pad[Math.floor(s.pad.length / 2)];
        const d = Math.hypot(m.x - cp.x, m.y - cp.y, m.z - cp.z);
        if (d > afstand * 2.2 + 120) continue;
        v.set(m.x, m.y, m.z).project(this.cam);
        if (v.z > 1 || Math.abs(v.x) > 0.95 || Math.abs(v.y) > 0.9) continue;
        // Per straat het stuk dat het dichtst bij het midden van het beeld ligt.
        const score = Math.hypot(v.x, v.y);
        const b = beste.get(s.naam);
        if (!b || score < b.d) beste.set(s.naam, { s, d: score });
      }
      const gezet: { x: number; y: number }[][] = [];
      for (const { s } of [...beste.values()].sort((a, b) => a.d - b.d).slice(0, 28)) {
        // Een stuk van de straat dat niet achter een gebouw ligt (midden, dan iets ervoor of erna).
        let i = -1;
        for (const f of [0.5, 0.3, 0.7, 0.15, 0.85]) {
          const j = Math.min(s.pad.length - 2, Math.max(0, Math.floor(s.pad.length * f)));
          if (!this.bedekt(s.pad[j].x, s.pad[j].y + 0.5, s.pad[j].z)) { i = j; break; }
        }
        if (i < 0) continue;
        const m = s.pad[i], q = s.pad[Math.min(s.pad.length - 1, i + 1)];
        v.set(m.x, m.y + 0.5, m.z).project(this.cam);
        if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
        v2.set(q.x + (q.x - m.x) * 3, q.y + 0.5, q.z + (q.z - m.z) * 3).project(this.cam);
        const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
        let hoek = Math.atan2(-(v2.y - v.y) * innerHeight, (v2.x - v.x) * innerWidth) * 180 / Math.PI;
        if (hoek > 90) hoek -= 180; if (hoek < -90) hoek += 180;
        // Niet over een andere naam heen: elke naam als een rijtje punten langs de tekst.
        const half = s.naam.length * 3.4 + 6, cs = Math.cos(hoek * Math.PI / 180), sn = Math.sin(hoek * Math.PI / 180);
        const punten = [-1, -0.5, 0, 0.5, 1].map(f => ({ x: x + cs * half * f, y: y + sn * half * f }));
        if (gezet.some(q => q.some(a => punten.some(b => Math.abs(a.x - b.x) < half * 0.5 + 8 && Math.abs(a.y - b.y) < 15)))) continue;
        gezet.push(punten);
        const el = this.pool[n] ?? this.laag.appendChild(Object.assign(document.createElement('div'), { className: 'label' }));
        this.pool[n] = el;
        if (el.textContent !== s.naam) el.textContent = s.naam;
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${hoek}deg)`;
        el.style.opacity = String(Math.max(0, Math.min(1, (650 - afstand) / 200)));
        el.style.display = 'block';
        n++;
      }
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].style.display = 'none';
  }
}

function binnen(x: number, z: number, p: { x: number; z: number }[]): boolean {
  let in_ = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    if ((p[i].z > z) !== (p[j].z > z) && x < (p[j].x - p[i].x) * (z - p[i].z) / (p[j].z - p[i].z) + p[i].x) in_ = !in_;
  }
  return in_;
}
