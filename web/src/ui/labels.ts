import * as THREE from 'three';
import { Wereld } from '../core/wereld';
import type { Segment } from '../core/wegen/netwerk';

/** Straatnamen op de kaart, zoals in Cities: Skylines: alleen dichtbij, langs de weg gedraaid. */
export class StraatLabels {
  private laag = document.createElement('div');
  private pool: HTMLElement[] = [];
  private klok = 0;

  constructor(private w: Wereld, private cam: THREE.PerspectiveCamera) {
    this.laag.id = 'labels';
    document.body.appendChild(this.laag);
  }

  werkBij(dt: number, afstand: number, zichtbaar = true) {
    this.klok += dt;
    if (this.klok < 0.08) return;
    this.klok = 0;
    let n = 0;
    if (zichtbaar && afstand < 650) {
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
      for (const { s } of [...beste.values()].sort((a, b) => a.d - b.d).slice(0, 28)) {
        const i = Math.floor(s.pad.length / 2), m = s.pad[i], q = s.pad[Math.min(s.pad.length - 1, i + 1)];
        v.set(m.x, m.y + 0.5, m.z).project(this.cam);
        if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
        v2.set(q.x + (q.x - m.x) * 3, q.y + 0.5, q.z + (q.z - m.z) * 3).project(this.cam);
        const x = (v.x + 1) / 2 * innerWidth, y = (1 - v.y) / 2 * innerHeight;
        let hoek = Math.atan2(-(v2.y - v.y) * innerHeight, (v2.x - v.x) * innerWidth) * 180 / Math.PI;
        if (hoek > 90) hoek -= 180; if (hoek < -90) hoek += 180;
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
