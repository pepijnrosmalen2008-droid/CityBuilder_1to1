import * as THREE from 'three';
import { Wereld } from '../core/wereld';
import { Materialen } from './materialen';
import { naarMesh } from './meshes';
import { MeshData, MeshBouwer } from '../core/geom/mesh';
import { voertuigMesh, remlichten, zwaailichten } from '../core/geom/autos';
import { VoertuigSoort, AFMETING, LAKKEN } from '../core/verkeer/verkeer';
import { Baan } from '../core/verkeer/rijstroken';
import { cilinder } from '../core/geom/props';

// Voertuigen als instanties: per soort en detailniveau een gelakt deel (kleur per voertuig) en
// de rest (glas, banden, lampen). Remlichten als aparte, oplichtende laag; een zachte schaduwvlek
// onder elk voertuig (goedkoper dan de schaduwkaart elk beeld bij te werken). Verkeerslichten:
// palen met kop per aanvoerende weg, de brandende lamp per beeld.

const SOORTEN: VoertuigSoort[] = ['hatchback', 'sedan', 'stationwagen', 'suv', 'bestelbus', 'vrachtwagen', 'bus', 'politie', 'ambulance', 'brandweer'];
const HULP: VoertuigSoort[] = ['politie', 'ambulance', 'brandweer'];
const LOD_AFSTAND = 170;

function splits(data: MeshData): { lak: MeshData; rest: MeshData } {
  return { lak: { groepen: data.groepen.filter(g => g.materiaal === 'autolak') }, rest: { groepen: data.groepen.filter(g => g.materiaal !== 'autolak') } };
}

interface Laag { lak: THREE.InstancedMesh; rest: THREE.InstancedMesh | null; n: number }

export class VerkeerWeergave {
  groep = new THREE.Group();
  private lagen = new Map<string, Laag>();
  private rem = new Map<VoertuigSoort, { m: THREE.InstancedMesh; n: number }>();
  private zwaai = new Map<VoertuigSoort, { m: THREE.InstancedMesh; n: number }>();
  private klok = 0;
  private hulpKleur: Partial<Record<VoertuigSoort, THREE.Color>> = {
    politie: new THREE.Color().setRGB(0.95, 0.95, 0.95, THREE.SRGBColorSpace),
    ambulance: new THREE.Color().setRGB(0.98, 0.82, 0.05, THREE.SRGBColorSpace),
    brandweer: new THREE.Color().setRGB(0.75, 0.04, 0.03, THREE.SRGBColorSpace),
  };
  private vlek: THREE.InstancedMesh;
  private lakKleuren = LAKKEN.map(l => new THREE.Color().setRGB(...l.kleur, THREE.SRGBColorSpace));
  private wit = new THREE.Color().setRGB(0.93, 0.93, 0.92, THREE.SRGBColorSpace);
  private busKleur = new THREE.Color().setRGB(0.85, 0.12, 0.12, THREE.SRGBColorSpace);
  private lichtPalen: THREE.Mesh | null = null;
  private lampen: Record<'rood' | 'oranje' | 'groen', THREE.InstancedMesh>;
  private koppen: { knoop: number; seg: number; pos: THREE.Vector3[]; voor: THREE.Vector3 }[] = [];
  private teller = -1;
  private m = new THREE.Matrix4();
  private tmp = { f: new THREE.Vector3(), u: new THREE.Vector3(), r: new THREE.Vector3(), p: new THREE.Vector3() };

  constructor(private w: Wereld, private mats: Materialen, readonly max = 1200) {
    for (const soort of SOORTEN) for (const laag of [false, true]) {
      const { lak, rest } = splits(voertuigMesh(soort, laag));
      const mLak = naarMesh(lak, mats, false, 'auto')!;
      const mRest = rest.groepen.length ? naarMesh(rest, mats, false, 'auto') : null;
      const inst = (m: THREE.Mesh) => {
        const im = new THREE.InstancedMesh(m.geometry, m.material, max);
        im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = true;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.groep.add(im);
        return im;
      };
      const l: Laag = { lak: inst(mLak), rest: mRest ? inst(mRest) : null, n: 0 };
      l.lak.setColorAt(0, this.wit); l.lak.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      this.lagen.set(`${soort}${laag ? 1 : 0}`, l);
    }
    for (const soort of SOORTEN) {
      const m = naarMesh(remlichten(soort), mats, false, 'rem')!;
      const im = new THREE.InstancedMesh(m.geometry, m.material, max);
      im.count = 0; im.frustumCulled = false; im.castShadow = false;
      this.groep.add(im);
      this.rem.set(soort, { m: im, n: 0 });
    }
    for (const soort of HULP) {
      const m = naarMesh(zwaailichten(soort), mats, false, 'zwaai')!;
      const im = new THREE.InstancedMesh(m.geometry, m.material, 200);
      im.count = 0; im.frustumCulled = false; im.castShadow = false;
      this.groep.add(im);
      this.zwaai.set(soort, { m: im, n: 0 });
    }
    // Schaduwvlek: zacht verloop van donker naar doorzichtig.
    const doek = document.createElement('canvas'); doek.width = doek.height = 64;
    const c = doek.getContext('2d')!;
    const g = c.createRadialGradient(32, 32, 4, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(doek);
    const vlakGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.vlek = new THREE.InstancedMesh(vlakGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }), max);
    this.vlek.count = 0; this.vlek.frustumCulled = false; this.vlek.renderOrder = 2;
    this.groep.add(this.vlek);
    // Lampen van de verkeerslichten.
    const lampGeo = new THREE.SphereGeometry(0.11, 10, 8);
    const lamp = (sleutel: string) => { const im = new THREE.InstancedMesh(lampGeo, mats.haal(sleutel), 2000); im.count = 0; im.frustumCulled = false; this.groep.add(im); return im; };
    this.lampen = { rood: lamp('verkeerslichtRood'), oranje: lamp('verkeerslichtOranje'), groen: lamp('verkeerslichtGroen') };
  }

  /** Verkeerslichtpalen opnieuw opbouwen als de rijstrookgraaf veranderd is. */
  private bouwPalen() {
    const st = this.w.verkeer.stroken;
    if (this.lichtPalen) { this.groep.remove(this.lichtPalen); this.lichtPalen.geometry.dispose(); this.lichtPalen = null; }
    this.koppen = [];
    const mb = new MeshBouwer();
    for (const l of st.lichten.values()) {
      for (const fase of l.fases) for (const seg of fase) {
        const s = this.w.net.segmenten.get(seg);
        if (!s) continue;
        const r = s.b === l.knoop ? 'A' : 'B';
        const banen = st.stroken(seg, r);
        if (!banen.length) continue;
        const plekken: { b: Baan; kant: number }[] = [{ b: banen[0], kant: 1 }];
        if (banen.length > 1) plekken.push({ b: banen[banen.length - 1], kant: -1 });
        const pos: THREE.Vector3[] = [];
        let voor = new THREE.Vector3();
        for (const { b, kant } of plekken) {
          const n = b.pts.length, e = b.pts[n - 1], q = b.pts[n - 2];
          const d = new THREE.Vector3(e.x - q.x, 0, e.z - q.z).normalize();
          const rechts = new THREE.Vector3(-d.z, 0, d.x);
          const p = new THREE.Vector3(e.x, e.y, e.z).addScaledVector(rechts, kant * 2.4).addScaledVector(d, -0.4);
          const yg = Math.max(e.y, this.w.terrein.hoogte(p.x, p.z));
          cilinder(mb, 'paal', { x: p.x, y: yg, z: p.z }, { x: p.x, y: yg + 3.4, z: p.z }, 0.07, 0.06, 8);
          // Kop met drie lampen, naar het aankomende verkeer gericht.
          const kop = { x: p.x - d.x * 0.18, y: yg + 2.75, z: p.z - d.z * 0.18 };
          mb.blok('trimDonker', 'trimDonker', { x: kop.x, y: 0, z: kop.z }, { x: rechts.x, y: 0, z: rechts.z }, { x: d.x, y: 0, z: d.z }, 0.34, 0.28, kop.y - 0.55, kop.y + 0.55, true);
          for (const [i, dy] of [[0, 0.33], [1, 0], [2, -0.33]] as const) {
            const lp = new THREE.Vector3(kop.x - d.x * 0.16, kop.y + dy, kop.z - d.z * 0.16);
            cilinder(mb, 'lampUit', { x: lp.x + d.x * 0.02, y: lp.y, z: lp.z + d.z * 0.02 }, { x: lp.x - d.x * 0.01, y: lp.y, z: lp.z - d.z * 0.01 }, 0.12, 0.12, 10);
            pos[i] = pos[i] ?? lp; if (kant === -1) pos.push(lp);
          }
          voor = d;
        }
        this.koppen.push({ knoop: l.knoop, seg, pos, voor });
      }
    }
    const mesh = naarMesh(mb.bouw(), this.mats, true, 'verkeerslichten');
    if (mesh) { this.lichtPalen = mesh; this.groep.add(mesh); }
  }

  werkBij(cam: THREE.Vector3, dt = 0.016) {
    const vk = this.w.verkeer;
    this.klok += dt;
    // Zwaailichten knipperen (twee keer per seconde).
    const aan = Math.floor(this.klok * 4) % 2 === 0;
    for (const z of this.zwaai.values()) z.n = 0;
    if (vk.stroken.teller !== this.teller) { this.teller = vk.stroken.teller; this.bouwPalen(); }
    for (const l of this.lagen.values()) l.n = 0;
    for (const r of this.rem.values()) r.n = 0;
    let nv = 0;
    const { f, u, r, p } = this.tmp;
    const schaal = new THREE.Vector3(1, 1, 1);
    const q = new THREE.Quaternion();
    for (const v of vk.voertuigen.values()) {
      const sp = vk.stroken.sporen.get(v.spoor);
      if (!sp) continue;
      const L = v.lengte;
      const voor = vk.punt(v, v.s - L * 0.18), achter = vk.punt(v, v.s - L * 0.82);
      f.set(voor.x - achter.x, voor.y - achter.y, voor.z - achter.z);
      if (f.lengthSq() < 1e-6) f.set(voor.dx, 0, voor.dz);
      f.normalize();
      r.set(-f.z, 0, f.x).normalize();
      // Strookwissel: zijwaarts verschoven en een beetje schuin in de rijrichting.
      const zijV = -1.2 * v.zij;
      if (v.zij !== 0) { f.multiplyScalar(Math.max(1.5, v.v)).addScaledVector(r, zijV).normalize(); r.set(-f.z, 0, f.x).normalize(); }
      u.crossVectors(r, f).normalize();
      p.set((voor.x + achter.x) / 2, (voor.y + achter.y) / 2 + 0.03, (voor.z + achter.z) / 2).addScaledVector(r, v.zij);
      const ver = p.distanceToSquared(cam) > LOD_AFSTAND * LOD_AFSTAND;
      const laag = this.lagen.get(`${v.soort}${ver ? 1 : 0}`)!;
      if (laag.n >= this.max) continue;
      this.m.makeBasis(f, u, r).setPosition(p);
      laag.lak.setMatrixAt(laag.n, this.m);
      laag.rest?.setMatrixAt(laag.n, this.m);
      const kleur = this.hulpKleur[v.soort] ?? (v.soort === 'bus' ? this.busKleur : v.soort === 'vrachtwagen' && v.lak > 7 ? this.wit : this.lakKleuren[v.lak]);
      if (v.sirene && aan) { const z = this.zwaai.get(v.soort); if (z) z.m.setMatrixAt(z.n++, this.m); }
      laag.lak.setColorAt(laag.n, kleur);
      laag.n++;
      if (v.rem && !ver) { const rm = this.rem.get(v.soort)!; rm.m.setMatrixAt(rm.n++, this.m); }
      // Schaduwvlek.
      q.setFromRotationMatrix(this.m);
      schaal.set(L * 1.15, 1, AFMETING[v.soort].b * 1.35);
      p.y -= 0.0;
      this.m.compose(p, q, schaal);
      this.vlek.setMatrixAt(nv++, this.m);
    }
    for (const l of this.lagen.values()) {
      l.lak.count = l.n; l.lak.visible = l.n > 0; l.lak.instanceMatrix.needsUpdate = true; if (l.lak.instanceColor) l.lak.instanceColor.needsUpdate = true;
      if (l.rest) { l.rest.count = l.n; l.rest.visible = l.n > 0; l.rest.instanceMatrix.needsUpdate = true; }
    }
    for (const rm of this.rem.values()) { rm.m.count = rm.n; rm.m.visible = rm.n > 0; rm.m.instanceMatrix.needsUpdate = true; }
    for (const z of this.zwaai.values()) { z.m.count = z.n; z.m.visible = z.n > 0; z.m.instanceMatrix.needsUpdate = true; }
    this.vlek.count = nv; this.vlek.instanceMatrix.needsUpdate = true;
    // Verkeerslichten.
    const n = { rood: 0, oranje: 0, groen: 0 };
    for (const k of this.koppen) {
      const stand = vk.stroken.lichtVoor(k.knoop, k.seg);
      if (!stand) continue;
      const i = stand === 'rood' ? 0 : stand === 'oranje' ? 1 : 2;
      for (let j = i; j < k.pos.length; j += 3) {
        const lp = k.pos[j];
        if (!lp) continue;
        this.m.makeTranslation(lp.x, lp.y, lp.z);
        this.lampen[stand].setMatrixAt(n[stand]++, this.m);
      }
    }
    for (const s of ['rood', 'oranje', 'groen'] as const) { this.lampen[s].count = n[s]; this.lampen[s].visible = n[s] > 0; this.lampen[s].instanceMatrix.needsUpdate = true; }
  }
}
