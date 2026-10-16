import * as THREE from 'three';
import type { Voorbeeld } from '../core/gereedschap';
import type { V3 } from '../core/math';
import { Wereld } from '../core/wereld';
import { halveBreedte } from '../core/wegen/typen';

/** Tekent wat het gereedschap van plan is: spookweg, penseel, gemarkeerde weg of gebouw. */
export class VoorbeeldLaag {
  groep = new THREE.Group();
  private lint: THREE.Mesh;
  private lintMat = new THREE.MeshBasicMaterial({ color: 0x40c057, transparent: true, opacity: 0.45, depthWrite: false, depthTest: false });
  private ring: THREE.Mesh;
  private ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false });
  private stippen: THREE.InstancedMesh;
  private kader: THREE.LineSegments;
  private gids: THREE.LineSegments;
  private snapRing: THREE.Mesh;
  private kavelVlak: THREE.Mesh;
  private kavelLijn: THREE.LineSegments;

  constructor(private w: Wereld) {
    this.lint = new THREE.Mesh(new THREE.BufferGeometry(), this.lintMat);
    this.ring = new THREE.Mesh(new THREE.BufferGeometry(), this.ringMat);
    this.stippen = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }), 4);
    this.kader = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff6b6b, depthTest: false }));
    this.gids = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.85, depthTest: false }));
    this.snapRing = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.0, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x66d9ff, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }));
    this.kavelVlak = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    this.kavelLijn = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthTest: false }));
    for (const o of [this.lint, this.ring, this.stippen, this.kader, this.gids, this.snapRing, this.kavelVlak, this.kavelLijn]) { o.renderOrder = 10; o.frustumCulled = false; o.visible = false; o.userData.geenAO = true; this.groep.add(o); }
  }

  private lintLangs(as: V3[], breedte: number, dy = 0.4) {
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i < as.length; i++) {
      const a = as[Math.max(0, i - 1)], b = as[Math.min(as.length - 1, i + 1)];
      let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const rx = -dz * breedte / 2, rz = dx * breedte / 2;
      pos.push(as[i].x - rx, as[i].y + dy, as[i].z - rz, as[i].x + rx, as[i].y + dy, as[i].z + rz);
      if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    this.lint.geometry.dispose(); this.lint.geometry = g;
  }

  /** Meerdere spooklinten in één mesh (raster, parallel). */
  private lintenLangs(lijnen: V3[][], breedte: number, dy: number) {
    const pos: number[] = [], idx: number[] = [];
    for (const as of lijnen) {
      const o0 = pos.length / 3;
      for (let i = 0; i < as.length; i++) {
        const a = as[Math.max(0, i - 1)], b = as[Math.min(as.length - 1, i + 1)];
        let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const rx = -dz * breedte / 2, rz = dx * breedte / 2;
        pos.push(as[i].x - rx, as[i].y + dy, as[i].z - rz, as[i].x + rx, as[i].y + dy, as[i].z + rz);
        if (i) { const o = o0 + (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    this.lint.geometry.dispose(); this.lint.geometry = g;
  }

  toon(v: Voorbeeld) {
    this.lint.visible = this.ring.visible = this.stippen.visible = this.kader.visible = false;
    this.gids.visible = this.snapRing.visible = this.kavelVlak.visible = this.kavelLijn.visible = false;
    const t = this.w.terrein;
    switch (v.soort) {
      case 'weg': {
        const lijnen = [...(v.as.length > 1 ? [v.as] : []), ...(v.meer ?? [])];
        if (lijnen.length) {
          this.lintenLangs(lijnen, v.breedte, 0.6);
          this.lintMat.color.set(v.geldig ? 0x40c057 : 0xfa5252);
          this.lint.visible = true;
        }
        // Hulplijnen en snappunt.
        if (v.lijnen.length) {
          const pos: number[] = [];
          for (const [a, b] of v.lijnen) pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          this.gids.geometry.dispose(); this.gids.geometry = geo; this.gids.visible = true;
        }
        if (v.snap) { this.snapRing.position.set(v.snap.x, Math.max(v.snap.y, 0) + 0.9, v.snap.z); this.snapRing.visible = true; }
        // Kavelvoorbeeld: bouwgrond langs de weg met perceelgrenzen.
        if (v.kavels.length) {
          const pos: number[] = [], idx: number[] = [], lijn: number[] = [];
          for (const k of v.kavels) {
            const o = pos.length / 3;
            for (let i = 0; i < k.voor.length; i++) {
              pos.push(k.voor[i].x, k.voor[i].y + 0.5, k.voor[i].z, k.achter[i].x, k.achter[i].y + 0.5, k.achter[i].z);
              if (i) { const a = o + (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
              if (i) lijn.push(k.achter[i - 1].x, k.achter[i - 1].y + 0.6, k.achter[i - 1].z, k.achter[i].x, k.achter[i].y + 0.6, k.achter[i].z);
            }
            for (const [a, b] of k.streepjes) lijn.push(a.x, a.y + 0.6, a.z, b.x, b.y + 0.6, b.z);
          }
          const g1 = new THREE.BufferGeometry(); g1.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g1.setIndex(idx);
          this.kavelVlak.geometry.dispose(); this.kavelVlak.geometry = g1; this.kavelVlak.visible = true;
          const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(lijn, 3));
          this.kavelLijn.geometry.dispose(); this.kavelLijn.geometry = g2; this.kavelLijn.visible = true;
          const vm = this.kavelVlak.material as THREE.MeshBasicMaterial; vm.color.set(0xffffff); vm.opacity = 0.16;
          (this.kavelLijn.material as THREE.LineBasicMaterial).color.set(0xffffff);
        }
        const m = new THREE.Matrix4();
        v.punten.slice(0, 4).forEach((p, i) => this.stippen.setMatrixAt(i, m.makeTranslation(p.x, Math.max(p.y, 0) + 0.6, p.z)));
        this.stippen.count = Math.min(4, v.punten.length);
        this.stippen.instanceMatrix.needsUpdate = true;
        this.stippen.visible = true;
        break;
      }
      case 'penseel': {
        const pos: number[] = [], idx: number[] = [];
        const n = 72;
        for (let i = 0; i <= n; i++) {
          const a = i / n * Math.PI * 2;
          for (const r of [v.r - 0.8, v.r + 0.8]) {
            const x = v.m.x + Math.cos(a) * r, z = v.m.z + Math.sin(a) * r;
            pos.push(x, t.hoogte(x, z) + 0.8, z);
          }
          if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
        this.ring.geometry.dispose(); this.ring.geometry = g;
        this.ringMat.color.set(v.kleur);
        this.ring.visible = true;
        break;
      }
      case 'zoneSel': {
        if (v.m && v.r) {
          const pos: number[] = [], idx: number[] = [];
          const n = 72;
          for (let i = 0; i <= n; i++) {
            const a = i / n * Math.PI * 2;
            for (const r of [v.r - 0.8, v.r + 0.8]) { const x = v.m.x + Math.cos(a) * r, z = v.m.z + Math.sin(a) * r; pos.push(x, t.hoogte(x, z) + 0.8, z); }
            if (i) { const o = (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
          }
          const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
          this.ring.geometry.dispose(); this.ring.geometry = g; this.ringMat.color.set(v.kleur); this.ring.visible = true;
        }
        if (v.kader) {
          const pos: number[] = [];
          for (let i = 0; i < v.kader.length; i++) { const a = v.kader[i], b = v.kader[(i + 1) % v.kader.length]; pos.push(a.x, a.y + 0.8, a.z, b.x, b.y + 0.8, b.z); }
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          this.kader.geometry.dispose(); this.kader.geometry = geo; (this.kader.material as THREE.LineBasicMaterial).color.set(v.kleur); this.kader.visible = true;
        }
        // De kavels die veranderen: oplichten in de kleur van de zone, met omlijning per kavel (zoals de cellen in CS).
        if (v.kavels.length) {
          const pos: number[] = [], idx: number[] = [], lijn: number[] = [];
          for (const id of v.kavels) {
            const k = this.w.kavels.get(id); if (!k) continue;
            const o = pos.length / 3, n = k.poly.length;
            for (const q of k.poly) pos.push(q.x, t.hoogte(q.x, q.z) + 0.5, q.z);
            for (let i = 1; i < n - 1; i++) idx.push(o, o + i, o + i + 1);
            for (let i = 0; i < n; i++) { const a = k.poly[i], b = k.poly[(i + 1) % n]; lijn.push(a.x, t.hoogte(a.x, a.z) + 0.6, a.z, b.x, t.hoogte(b.x, b.z) + 0.6, b.z); }
          }
          const g1 = new THREE.BufferGeometry(); g1.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g1.setIndex(idx);
          this.kavelVlak.geometry.dispose(); this.kavelVlak.geometry = g1; this.kavelVlak.visible = true;
          const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(lijn, 3));
          this.kavelLijn.geometry.dispose(); this.kavelLijn.geometry = g2; this.kavelLijn.visible = true;
          const vm = this.kavelVlak.material as THREE.MeshBasicMaterial; vm.color.set(v.kleur); vm.opacity = 0.5;
          (this.kavelLijn.material as THREE.LineBasicMaterial).color.set(v.kleur);
        }
        break;
      }
      case 'gebied': {
        const pts = v.dicht ? [...v.punten, v.punten[0]] : v.punten;
        if (pts.length > 1) {
          this.lintLangs(pts.map(q => ({ ...q, y: Math.max(q.y, 0) })), 2, 0.8);
          this.lintMat.color.set(v.kleur);
          this.lint.visible = true;
        }
        if (v.hoofd) {
          // Omtrek van het erf van het hoofdgebouw (46 × 40 m), voorkant naar de weg.
          const { p, rot } = v.hoofd;
          const vx = Math.sin(rot), vz = Math.cos(rot), ux = vz, uz = -vx;
          const hoek = (a: number, b: number) => ({ x: p.x + ux * a + vx * b, z: p.z + uz * a + vz * b });
          const hk = [hoek(-23, -20), hoek(23, -20), hoek(23, 20), hoek(-23, 20)];
          const pos: number[] = [];
          for (let i = 0; i < 4; i++) {
            const a = hk[i], b = hk[(i + 1) % 4];
            for (const y of [0.6, 6]) pos.push(a.x, Math.max(t.hoogte(a.x, a.z), 0) + y, a.z, b.x, Math.max(t.hoogte(b.x, b.z), 0) + y, b.z);
            pos.push(a.x, Math.max(t.hoogte(a.x, a.z), 0) + 0.6, a.z, a.x, Math.max(t.hoogte(a.x, a.z), 0) + 6, a.z);
          }
          const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
          this.kader.geometry.dispose(); this.kader.geometry = geo;
          (this.kader.material as THREE.LineBasicMaterial).color.set(v.kleur);
          this.kader.visible = true;
        }
        const m = new THREE.Matrix4();
        const n = Math.min(4, v.punten.length - 1);
        for (let i = 0; i < n; i++) this.stippen.setMatrixAt(i, m.makeTranslation(v.punten[i].x, Math.max(v.punten[i].y, 0) + 0.6, v.punten[i].z));
        this.stippen.count = n; this.stippen.instanceMatrix.needsUpdate = true; this.stippen.visible = n > 0;
        break;
      }
      case 'dienst': {
        if (v.voet.length) {
          const pts = [...v.voet, v.voet[0]].map(q => ({ ...q, y: Math.max(q.y, 0) }));
          this.lintLangs(pts, 2.5, 0.8);
          this.lintMat.color.set(v.geldig ? 0x40c057 : 0xfa5252);
          this.lint.visible = true;
        }
        break;
      }
      case 'markeer': {
        if (v.dienst !== undefined) {
          const d = this.w.voorzieningen.diensten.get(v.dienst);
          if (d) { this.lintLangs([...d.voet, d.voet[0]].map(q => ({ x: q.x, y: this.w.terrein.hoogte(q.x, q.z), z: q.z })), 3, 0.8); this.lintMat.color.set(v.kleur); this.lint.visible = true; }
        }
        if (v.gebied !== undefined) {
          const gb = this.w.economie.gebieden.get(v.gebied);
          if (gb) { this.lintLangs([...gb.poly, gb.poly[0]].map(q => ({ x: q.x, y: this.w.terrein.hoogte(q.x, q.z), z: q.z })), 3, 0.8); this.lintMat.color.set(v.kleur); this.lint.visible = true; }
        }
        if (v.segmenten?.length) {
          const lijnen = v.segmenten.map(id => this.w.net.segmenten.get(id)).filter(Boolean).map(seg => seg!.pad.map(p => ({ x: p.x, y: p.y, z: p.z })));
          const br = Math.max(...v.segmenten.map(id => { const sg = this.w.net.segmenten.get(id); return sg ? halveBreedte(sg.type) * 2 : 0; }));
          this.lintenLangs(lijnen, br + 1, 0.5); this.lintMat.color.set(v.kleur); this.lint.visible = true;
        }
                if (v.segment !== undefined) {
          const seg = this.w.net.segmenten.get(v.segment);
          if (seg) {
            this.lintLangs(seg.pad.map(p => ({ x: p.x, y: p.y, z: p.z })), halveBreedte(seg.type) * 2 + 1, 0.5);
            this.lintMat.color.set(v.kleur);
            this.lint.visible = true;
          }
        }
        if (v.gebouw !== undefined) {
          const g = this.w.gebouwen.get(v.gebouw);
          if (g) {
            const h = g.y + g.lagen.reduce((s, l) => s + l.hoogte, 0) + 2;
            const pos: number[] = [];
            const n = g.voet.length;
            for (let i = 0; i < n; i++) {
              const a = g.voet[i], b = g.voet[(i + 1) % n];
              for (const y of [g.y, h]) pos.push(a.x, y, a.z, b.x, y, b.z);
              pos.push(a.x, g.y, a.z, a.x, h, a.z);
            }
            const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            this.kader.geometry.dispose(); this.kader.geometry = geo;
            (this.kader.material as THREE.LineBasicMaterial).color.set(v.kleur);
            this.kader.visible = true;
          }
        }
        break;
      }
    }
  }
}
