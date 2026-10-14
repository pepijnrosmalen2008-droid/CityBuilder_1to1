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

  constructor(private w: Wereld) {
    this.lint = new THREE.Mesh(new THREE.BufferGeometry(), this.lintMat);
    this.ring = new THREE.Mesh(new THREE.BufferGeometry(), this.ringMat);
    this.stippen = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 }), 4);
    this.kader = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xff6b6b, depthTest: false }));
    for (const o of [this.lint, this.ring, this.stippen, this.kader]) { o.renderOrder = 10; o.frustumCulled = false; o.visible = false; o.userData.geenAO = true; this.groep.add(o); }
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

  toon(v: Voorbeeld) {
    this.lint.visible = this.ring.visible = this.stippen.visible = this.kader.visible = false;
    const t = this.w.terrein;
    switch (v.soort) {
      case 'weg': {
        if (v.as.length > 1) {
          this.lintLangs(v.as, v.breedte, 0.6);
          this.lintMat.color.set(v.geldig ? 0x40c057 : 0xfa5252);
          this.lint.visible = true;
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
      case 'markeer': {
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
            const ax = { x: -g.voor.z, z: g.voor.x }, az = g.voor;
            const h = g.lagen.reduce((s, l) => s + l.hoogte, 0) + 2;
            const P = (u: number, vv: number, y: number) => [g.centrum.x + ax.x * u + az.x * vv, g.y + y, g.centrum.z + ax.z * u + az.z * vv];
            const B = g.breedte / 2 + 0.5, D = g.diepte / 2 + 0.5;
            const hoeken = [[-B, -D], [B, -D], [B, D], [-B, D]];
            const pos: number[] = [];
            for (let i = 0; i < 4; i++) {
              const [u0, v0] = hoeken[i], [u1, v1] = hoeken[(i + 1) % 4];
              for (const y of [0, h]) pos.push(...P(u0, v0, y), ...P(u1, v1, y));
              pos.push(...P(u0, v0, 0), ...P(u0, v0, h));
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
