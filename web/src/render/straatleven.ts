import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { StraatLeven } from '../core/straatleven';
import { Wereld } from '../core/wereld';
import { NACHT } from './materialen';

// Voetgangers en fietsers als instanties: per soort een getint deel (kleding) en een vast deel
// (huid, broek, fiets) met vertexkleuren. Vier draw calls in totaal, geen schaduw (te klein),
// alleen ingezoomd. Lopen = op en neer veren en licht wiegen; fietsers trappen.

const HUID = [new THREE.Color(0xe8b896), new THREE.Color(0xc68a62), new THREE.Color(0x8d5a3b), new THREE.Color(0xf1cdb0)];
const KLEREN = [0x2f6db5, 0xc0392b, 0xf2f2f2, 0x2d2d2d, 0x3e8e5a, 0xe1b12c, 0x8e44ad, 0xd35400, 0x7f8c8d, 0x16a085, 0xe84393, 0x34495e].map(c => new THREE.Color(c));

function kleur(geo: THREE.BufferGeometry, c: THREE.Color | number) {
  const k = c instanceof THREE.Color ? c : new THREE.Color(c);
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = k.r; a[i * 3 + 1] = k.g; a[i * 3 + 2] = k.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
const doos = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const zonderUv = (g: THREE.BufferGeometry) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; };
const samen = (l: THREE.BufferGeometry[]) => mergeGeometries(l.map(zonderUv))!;

export class StraatLevenWeergave {
  groep = new THREE.Group();
  leven: StraatLeven;
  private voetKleding: THREE.InstancedMesh;
  private voetVast: THREE.InstancedMesh;
  private fietsKleding: THREE.InstancedMesh;
  private fietsVast: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3(1, 1, 1);
  private c = new THREE.Color();

  constructor(private w: Wereld, readonly max = 320) {
    this.leven = new StraatLeven(w.net);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    // Voetganger (1,75 m): romp getint, hoofd en benen vast.
    const romp = samen([doos(0.4, 0.58, 0.24, 0, 1.18, 0), doos(0.11, 0.5, 0.12, -0.26, 1.15, 0), doos(0.11, 0.5, 0.12, 0.26, 1.15, 0)]);
    kleur(romp, 0xffffff);
    const vast = samen([
      kleur(doos(0.15, 0.86, 0.17, -0.1, 0.45, 0), 0x2c3e50), kleur(doos(0.15, 0.86, 0.17, 0.1, 0.45, 0), 0x2c3e50),
      kleur(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.6, 0), HUID[0]),
      kleur(new THREE.SphereGeometry(0.125, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.63, -0.01), 0x3b2a20),
      kleur(doos(0.16, 0.06, 0.26, -0.1, 0.03, 0.03), 0x1a1a1a), kleur(doos(0.16, 0.06, 0.26, 0.1, 0.03, 0.03), 0x1a1a1a),
    ]);
    // Fietser: fiets (frame, wielen) en berijder; jas getint.
    const wiel = (z: number) => kleur(new THREE.TorusGeometry(0.33, 0.035, 4, 14).rotateY(Math.PI / 2).translate(0, 0.35, z), 0x151515);
    const buis = (a: THREE.Vector3, b: THREE.Vector3, r = 0.025) => {
      const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), 5);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
      return kleur(g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), 0x1f3a5f);
    };
    const V = (y: number, z: number) => new THREE.Vector3(0, y, z);
    const fietsVast = samen([
      wiel(0.52), wiel(-0.52), buis(V(0.35, -0.52), V(0.55, -0.05)), buis(V(0.55, -0.05), V(0.92, -0.12)), buis(V(0.55, -0.05), V(0.88, 0.38)),
      buis(V(0.88, 0.38), V(0.35, 0.52)), buis(V(0.35, -0.52), V(0.92, -0.12)), buis(V(0.88, 0.38), V(1.02, 0.36)),
      kleur(doos(0.5, 0.04, 0.04, 0, 1.02, 0.36), 0x222222), kleur(doos(0.14, 0.05, 0.24, 0, 0.95, -0.14), 0x222222),
      kleur(doos(0.13, 0.5, 0.14, -0.11, 0.73, 0.06).rotateX(-0.5), 0x2c3e50), kleur(doos(0.13, 0.5, 0.14, 0.11, 0.73, 0.06).rotateX(-0.3), 0x2c3e50),
      kleur(new THREE.SphereGeometry(0.12, 8, 6).translate(0, 1.62, 0.12), HUID[1]),
    ]);
    const fietsRomp = samen([doos(0.38, 0.56, 0.24, 0, 1.25, 0.04).rotateX(0.22), doos(0.1, 0.46, 0.1, -0.2, 1.17, 0.22).rotateX(-0.9), doos(0.1, 0.46, 0.1, 0.2, 1.17, 0.22).rotateX(-0.9)]);
    kleur(fietsRomp, 0xffffff);
    const inst = (g: THREE.BufferGeometry, n: number, tint: boolean) => {
      g.computeVertexNormals();
      const im = new THREE.InstancedMesh(g, mat, n);
      im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (tint) { im.setColorAt(0, this.c.set(0xffffff)); im.instanceColor!.setUsage(THREE.DynamicDrawUsage); }
      im.userData.geenAO = true;
      this.groep.add(im);
      return im;
    };
    this.voetKleding = inst(romp, max, true); this.voetVast = inst(vast, max, true);
    this.fietsKleding = inst(fietsRomp, max, true); this.fietsVast = inst(fietsVast, max, false);
  }

  /** Per beeld: alleen ingezoomd (afstand < 420 m) en in de buurt van het kijkpunt. */
  werkBij(dt: number, doel: THREE.Vector3, afstand: number, snelheid: number, cap = this.max) {
    const aan = afstand < 420;
    this.groep.visible = aan;
    if (!aan) { this.leven.lopers.length = 0; return; }
    const straal = Math.min(260, 90 + afstand * 0.55);
    const dichtheid = (1 - 0.75 * NACHT.value) * Math.min(1, Math.max(0.3, this.w.stat.inwoners / 3000));
    this.leven.stap(Math.min(0.1, dt) * Math.max(snelheid > 0 ? 1 : 0, Math.min(snelheid, 3)), { x: doel.x, z: doel.z }, straal, Math.min(cap, this.max), dichtheid);
    let nv = 0, nf = 0;
    for (const l of this.leven.lopers) {
      const p = this.leven.plek(l);
      const kl = KLEREN[l.kleur % KLEREN.length];
      if (l.soort === 'voet') {
        const veer = Math.abs(Math.sin(l.fase)) * 0.045;
        this.e.set(0, p.rot, Math.sin(l.fase) * 0.04);
        this.q.setFromEuler(this.e);
        this.m.compose(this.v.set(p.x, p.y + veer, p.z), this.q, this.sc.set(1, 0.92 + (l.kleur % 13) / 100, 1));
        this.voetKleding.setMatrixAt(nv, this.m); this.voetKleding.setColorAt(nv, kl);
        this.voetVast.setMatrixAt(nv, this.m);
        // Vast deel licht variëren (broek en huid samen; goedkoper dan een derde laag).
        this.voetVast.setColorAt(nv, this.c.setScalar(0.8 + ((l.kleur >> 5) % 5) * 0.06));
        nv++;
      } else {
        this.e.set(0, p.rot, Math.sin(l.fase) * 0.03);
        this.q.setFromEuler(this.e);
        this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.sc.set(1, 1, 1));
        this.fietsVast.setMatrixAt(nf, this.m);
        this.m.compose(this.v.set(p.x, p.y + Math.sin(l.fase) * 0.02, p.z), this.q, this.sc);
        this.fietsKleding.setMatrixAt(nf, this.m); this.fietsKleding.setColorAt(nf, kl);
        nf++;
      }
    }
    for (const [im, n] of [[this.voetKleding, nv], [this.voetVast, nv], [this.fietsKleding, nf], [this.fietsVast, nf]] as const) {
      im.count = n; im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
