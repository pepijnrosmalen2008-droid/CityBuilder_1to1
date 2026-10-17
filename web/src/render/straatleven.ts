import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { StraatLeven } from '../core/straatleven';
import { Wereld } from '../core/wereld';
import { NACHT } from './materialen';

// Voetgangers en fietsers als instanties: per soort een getint deel (kleding) en een vast deel
// (huid, broek, fiets) met vertexkleuren. Vier draw calls in totaal, geen schaduw (te klein),
// alleen ingezoomd. Lopen = op en neer veren en licht wiegen; fietsers trappen.

const HUID = [new THREE.Color(0xe8b896), new THREE.Color(0xc68a62), new THREE.Color(0x8d5a3b), new THREE.Color(0xf1cdb0)];
// Stedelijke kleding: veel donker, navy, beige en wit, af en toe een kleur.
const KLEREN = [0x1f2a3c, 0x2b2b2e, 0xd9d2c3, 0x6b5b45, 0xf0eee8, 0x3d4a5c, 0x8a2f2a, 0x556b4a, 0xb08a5a, 0x7a7f86, 0x2f4f6f, 0xc9b28a, 0x9a3b4f, 0x46505e].map(c => new THREE.Color(c));
const BROEKEN = [0x2b3a55, 0x1c1c1e, 0x3a4a68, 0xbfb29a, 0x4a4a4e, 0x5a4a3a, 0x24304a].map(c => new THREE.Color(c));

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
  /** Benen en armen apart, zodat ze echt meezwaaien bij het lopen. */
  private benen: THREE.InstancedMesh[];
  private armen: THREE.InstancedMesh[];
  private mb = new THREE.Matrix4();
  private mr = new THREE.Matrix4();
  private mz = new THREE.Matrix4();
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
    // Voetganger (1,75 m): afgeronde romp met heupen (getint: jas), hoofd met haar en nek (getint: huidskleur),
    // benen (broek, schoenen) en armen (mouwen) los aan heup en schouder.
    const romp = samen([
      new THREE.CapsuleGeometry(0.16, 0.36, 4, 10).scale(1.18, 1, 0.68).translate(0, 1.2, 0),
      new THREE.CapsuleGeometry(0.13, 0.12, 3, 10).scale(1.25, 1, 0.75).translate(0, 0.94, 0),
    ]);
    kleur(romp, 0xffffff);
    const vast = samen([
      kleur(new THREE.CylinderGeometry(0.048, 0.055, 0.12, 8).translate(0, 1.58, 0), 0xffffff),
      kleur(new THREE.SphereGeometry(0.105, 12, 9).scale(0.9, 1.12, 1).translate(0, 1.71, 0.005), 0xffffff),
      kleur(new THREE.SphereGeometry(0.11, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.92, 1.1, 1.04).translate(0, 1.725, -0.008), 0x2a1d15),
    ]);
    const been = samen([
      kleur(new THREE.CapsuleGeometry(0.078, 0.74, 3, 8).translate(0, -0.44, 0), 0xffffff),
      kleur(doos(0.1, 0.07, 0.25, 0, -0.88, 0.04), 0x2a2a2a),
    ]);
    const arm = samen([kleur(new THREE.CapsuleGeometry(0.048, 0.5, 3, 7).translate(0, -0.3, 0), 0xffffff)]);
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
    this.benen = [inst(been, max, true), inst(been.clone(), max, true)];
    this.armen = [inst(arm, max, true), inst(arm.clone(), max, true)];
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
        const veer = Math.abs(Math.sin(l.fase)) * 0.035, zwaai = Math.sin(l.fase) * 0.42;
        this.e.set(0, p.rot, Math.sin(l.fase) * 0.025);
        this.q.setFromEuler(this.e);
        this.m.compose(this.v.set(p.x, p.y + veer, p.z), this.q, this.sc.set(1, 0.92 + (l.kleur % 13) / 100, 1));
        this.voetKleding.setMatrixAt(nv, this.m); this.voetKleding.setColorAt(nv, kl);
        this.voetVast.setMatrixAt(nv, this.m);
        this.voetVast.setColorAt(nv, HUID[(l.kleur >> 3) % HUID.length]);
        const broek = BROEKEN[(l.kleur >> 4) % BROEKEN.length];
        for (const [k, im] of this.benen.entries()) {
          const z = k ? 1 : -1;
          this.mb.makeTranslation(z * 0.095, 0.95, 0).multiply(this.mr.makeRotationX(zwaai * z));
          im.setMatrixAt(nv, this.mr.multiplyMatrices(this.m, this.mb)); im.setColorAt(nv, broek);
        }
        for (const [k, im] of this.armen.entries()) {
          const z = k ? 1 : -1;
          this.mb.makeTranslation(z * 0.235, 1.45, 0).multiply(this.mr.makeRotationX(-zwaai * z * 0.8)).multiply(this.mz.makeRotationZ(z * 0.07));
          im.setMatrixAt(nv, this.mr.multiplyMatrices(this.m, this.mb)); im.setColorAt(nv, kl);
        }
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
    for (const [im, n] of [[this.voetKleding, nv], [this.voetVast, nv], ...[...this.benen, ...this.armen].map(b => [b, nv] as const), [this.fietsKleding, nf], [this.fietsVast, nf]] as const) {
      im.count = n; im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
