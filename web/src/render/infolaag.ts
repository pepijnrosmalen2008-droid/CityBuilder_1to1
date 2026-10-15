import * as THREE from 'three';
import { Wereld } from '../core/wereld';
import { driehoeken } from '../core/poly';
import { halveBreedte } from '../core/wegen/typen';
import type { Nut } from '../core/voorzieningen';

// Infoweergaven zoals in Cities: Skylines: een kleurlaag over de percelen (of over de wegen
// voor het verkeer). Rood = slecht, geel = matig, groen = goed.

export type InfoSoort = 'verkeer' | 'stroom' | 'water' | 'afval' | 'brand' | 'politie' | 'zorg' | 'grondwaarde' | 'niveau';

export const INFO_NAAM: Record<InfoSoort, string> = {
  verkeer: 'Verkeer', stroom: 'Stroom', water: 'Water en riool', afval: 'Afval', brand: 'Brandweer', politie: 'Politie', zorg: 'Zorg', grondwaarde: 'Grondwaarde', niveau: 'Gebouwniveau',
};
export const INFO_LEGENDA: Record<InfoSoort, string> = {
  verkeer: 'Groen = doorstromend, rood = file', stroom: 'Rood = geen stroom', water: 'Rood = geen water of riool', afval: 'Rood = afval wordt niet opgehaald',
  brand: 'Groen = dicht bij een kazerne', politie: 'Groen = dicht bij een bureau', zorg: 'Groen = dicht bij zorg', grondwaarde: 'Groen = hoge grondwaarde', niveau: 'Rood = niveau 1, groen = niveau 5',
};

function kleur(x: number, c = new THREE.Color()): THREE.Color {
  // Rood → geel → groen.
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? c.setRGB(0.92, 0.25 + t * 1.2, 0.2) : c.setRGB(0.92 - (t - 0.5) * 1.5, 0.85, 0.25);
}

export class InfoLaag {
  groep = new THREE.Group();
  soort: InfoSoort | null = null;
  private mesh: THREE.Mesh | null = null;
  private klok = 99;
  private mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 });

  constructor(private w: Wereld) { this.groep.renderOrder = 5; }

  zet(soort: InfoSoort | null) { this.soort = soort; this.klok = 99; if (!soort) this.leeg(); }

  private leeg() { if (this.mesh) { this.groep.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; } }

  werkBij(dt: number) {
    if (!this.soort) return;
    this.klok += dt;
    if (this.klok < 1) return;
    this.klok = 0;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const t = this.w.terrein, c = new THREE.Color();
    const vlak = (poly: { x: number; z: number }[], x: number, dy = 0.5) => {
      const tri = driehoeken(poly);
      const o = pos.length / 3;
      kleur(x, c);
      for (const p of poly) { pos.push(p.x, Math.max(t.hoogte(p.x, p.z), 0) + dy, p.z); col.push(c.r, c.g, c.b); }
      for (const i of tri) idx.push(o + i);
    };
    const s = this.soort;
    if (s === 'verkeer') {
      // Gemiddelde snelheid t.o.v. de toegestane snelheid, per wegstuk.
      const vk = this.w.verkeer;
      const per = new Map<number, { som: number; n: number }>();
      for (const v of vk.voertuigen.values()) {
        const sp = vk.stroken.sporen.get(v.spoor);
        if (!sp || sp.soort !== 'baan') continue;
        const x = per.get(sp.seg) ?? { som: 0, n: 0 };
        x.som += Math.min(1, v.v / Math.max(1, sp.vmax)); x.n++;
        per.set(sp.seg, x);
      }
      for (const seg of this.w.net.segmenten.values()) {
        const p = per.get(seg.id);
        const x = p ? Math.min(1, (p.som / p.n) * 1.3) : 1;
        const hb = halveBreedte(seg.type) * 0.8;
        const o = pos.length / 3;
        kleur(x, c);
        seg.pad.forEach((q, i) => {
          pos.push(q.x + q.dz * hb, q.y + 0.6, q.z - q.dx * hb, q.x - q.dz * hb, q.y + 0.6, q.z + q.dx * hb);
          col.push(c.r, c.g, c.b, c.r, c.g, c.b);
          if (i) { const a = o + (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        });
      }
    } else {
      const vz = this.w.voorzieningen, hd = this.w.hulpdiensten, gw = this.w.grondwaarde;
      const nuts: Record<string, Nut[]> = { stroom: ['stroom'], water: ['water', 'riool'], afval: ['afval'] };
      for (const g of this.w.gebouwen.values()) {
        if (!g.klaar) continue;
        let x: number;
        if (nuts[s]) x = nuts[s].some(n => vz.tekort.get(g.id)?.has(n)) ? 0 : 1;
        else if (s === 'brand' || s === 'politie' || s === 'zorg') x = hd.dekkingVan(g.id)[s];
        else if (s === 'grondwaarde') x = gw.van(g.id).waarde;
        else x = ((g.niveau ?? 1) - 1) / 4;
        vlak(g.perceel, x);
      }
      // De voorzieningen zelf in blauw.
      for (const d of vz.diensten.values()) {
        const o = pos.length / 3;
        for (const p of d.voet) { pos.push(p.x, Math.max(t.hoogte(p.x, p.z), 0) + 0.6, p.z); col.push(0.3, 0.6, 1); }
        for (const i of driehoeken(d.voet)) idx.push(o + i);
      }
    }
    this.leeg();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.userData.geenAO = true;
    this.groep.add(this.mesh);
  }
}
