import * as THREE from 'three';
import { Wereld, totaleHoogte } from '../core/wereld';
import { Materialen } from './materialen';
import { naarMesh, weg, schaduwMesh } from './meshes';
import { vereenvoudig } from '../core/geom/lod';
import { bouwDienst, windRotor, WIND, ASHOOGTE } from '../core/geom/dienstmesh';
import type { Nut } from '../core/voorzieningen';

// Nutsvoorzieningen in beeld: gebouwen, draaiende windturbines en meldingsicoontjes boven
// gebouwen zonder stroom, water, riolering of afvalophaal (zoals in Cities: Skylines).

const KLEUR: Record<Nut, string> = { stroom: '#f59f00', water: '#1c7ed6', riool: '#7950f2', afval: '#e8590c' };

function icoonTextuur(nut: Nut): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // Rond bordje met witte rand en schaduw.
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(64, 68, 54, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 62, 54, 0, Math.PI * 2); g.fill();
  g.fillStyle = KLEUR[nut]; g.beginPath(); g.arc(64, 62, 46, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 9; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  if (nut === 'stroom') { g.moveTo(70, 26); g.lineTo(46, 68); g.lineTo(64, 68); g.lineTo(56, 98); g.lineTo(84, 54); g.lineTo(66, 54); g.closePath(); g.fill(); }
  else if (nut === 'water') { g.moveTo(64, 26); g.bezierCurveTo(86, 54, 90, 66, 90, 74); g.arc(64, 74, 26, 0, Math.PI); g.bezierCurveTo(38, 66, 42, 54, 64, 26); g.fill(); }
  else if (nut === 'riool') { g.moveTo(36, 46); g.lineTo(76, 46); g.lineTo(76, 84); g.stroke(); g.beginPath(); g.arc(76, 92, 6, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(88, 98, 5, 0, Math.PI * 2); g.fill(); }
  else { g.moveTo(42, 46); g.lineTo(86, 46); g.lineTo(80, 96); g.lineTo(48, 96); g.closePath(); g.fill(); g.fillRect(54, 34, 20, 8); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class DienstWeergave {
  groep = new THREE.Group();
  private meshes = new Map<number, THREE.Object3D>();
  private rotors: THREE.Object3D[] = [];
  private rotorGeo: THREE.Mesh | null = null;
  private iconen: Record<Nut, THREE.InstancedMesh>;
  private m = new THREE.Matrix4();
  private vlam: THREE.InstancedMesh;
  private rook: THREE.InstancedMesh;
  private tijd = 0;

  constructor(private w: Wereld, private mats: Materialen) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const maak = (nut: Nut) => {
      const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: icoonTextuur(nut), transparent: true, depthTest: false, depthWrite: false }), 4000);
      im.count = 0; im.frustumCulled = false; im.renderOrder = 20; im.userData.geenAO = true;
      this.groep.add(im);
      return im;
    };
    this.iconen = { stroom: maak('stroom'), water: maak('water'), riool: maak('riool'), afval: maak('afval') };
    // Vuur en rook (billboards).
    const tex = (binnen: string, buiten: string) => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const r = g.createRadialGradient(32, 36, 2, 32, 32, 30);
      r.addColorStop(0, binnen); r.addColorStop(1, buiten);
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    this.vlam = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: tex('rgba(255,240,170,1)', 'rgba(255,90,0,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 2000);
    this.rook = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: tex('rgba(45,43,40,0.9)', 'rgba(70,68,64,0)'), transparent: true, depthWrite: false }), 2000);
    for (const im of [this.vlam, this.rook]) { im.count = 0; im.frustumCulled = false; im.userData.geenAO = true; this.groep.add(im); }
    for (const d of w.voorzieningen.diensten.values()) this.bouw(d.id);
  }

  /** Bomenlaag van de stad (bomen op het terrein van een voorziening). */
  private _props: { zet: (eigenaar: string, props: import('../core/geom/mesh').Prop[]) => void; wis: (eigenaar: string) => void } | null = null;
  get props() { return this._props; }
  set props(p) { this._props = p; for (const d of this.w.voorzieningen.diensten.values()) this.bouw(d.id); }

  private bouw(id: number) {
    const oud = this.meshes.get(id);
    if (oud) { weg(oud); this.meshes.delete(id); this.rotors = this.rotors.filter(r => r.userData.dienst !== id); }
    const d = this.w.voorzieningen.diensten.get(id);
    if (!d) { this.props?.wis(`dienst:${id}`); return; }
    const t = this.w.terrein;
    const r = bouwDienst(d, (x, z) => t.hoogte(x, z));
    this.props?.zet(`dienst:${id}`, r.props);
    // Dichtbij alle materialen, veraf de vereenvoudigde versie (textuurreeks); schaduw via één vervanger.
    const mesh = naarMesh(r.mesh, this.mats, false, d.soort);
    if (!mesh) return;
    const ver = naarMesh(vereenvoudig(r.mesh), this.mats, false, d.soort);
    const g = new THREE.Group();
    g.add(mesh);
    if (ver) { ver.visible = false; g.add(ver); g.userData.lod = { dicht: mesh, ver }; }
    const sch = schaduwMesh(r.mesh);
    if (sch) g.add(sch);
    g.userData.p = d.p;
    if (d.soort === 'windmolen' && d.klaar) {
      if (!this.rotorGeo) this.rotorGeo = naarMesh(windRotor(), this.mats, true, 'rotor');
      if (this.rotorGeo) {
        let Y = -Infinity; for (const q of d.voet) Y = Math.max(Y, t.hoogte(q.x, q.z)); Y += 0.1;
        const w = { x: Math.sin(WIND), z: Math.cos(WIND) };
        const naaf = new THREE.Group();
        naaf.position.set(d.p.x + w.x * 4.2, Y + ASHOOGTE, d.p.z + w.z * 4.2);
        naaf.rotation.y = Math.atan2(-w.z, w.x);
        const draai = new THREE.Mesh(this.rotorGeo.geometry, this.rotorGeo.material);
        draai.castShadow = true;
        draai.rotation.x = (id * 1.7) % 6.28;
        naaf.add(draai);
        naaf.userData.dienst = id;
        naaf.userData.draai = draai;
        g.add(naaf);
        this.rotors.push(naaf);
      }
    }
    this.groep.add(g);
    this.meshes.set(id, g);
  }

  lodAfstand = 380;

  werkBij(dt: number, cam: THREE.Camera, snelheid: number): boolean {
    let veranderd = false;
    for (const e of this.w.voorzieningen.haalEvents()) {
      if (e.soort === 'dienst-') { const o = this.meshes.get(e.id); if (o) { weg(o); this.meshes.delete(e.id); this.rotors = this.rotors.filter(r => r.userData.dienst !== e.id); } }
      else this.bouw(e.id);
      veranderd = true;
    }
    // Detailniveau per voorziening op afstand tot de camera.
    for (const g of this.meshes.values()) {
      const l = g.userData.lod as { dicht: THREE.Mesh; ver: THREE.Mesh } | undefined;
      if (!l) continue;
      const pp = g.userData.p as { x: number; z: number };
      const d = Math.hypot(pp.x - cam.position.x, pp.z - cam.position.z, cam.position.y);
      const ver = l.ver.visible ? d > this.lodAfstand * 0.85 : d > this.lodAfstand * 1.15;
      l.ver.visible = ver; l.dicht.visible = !ver;
    }
    // Rotors: ~13 omwentelingen per minuut.
    for (const r of this.rotors) (r.userData.draai as THREE.Mesh).rotation.x += dt * 1.35 * Math.min(1, snelheid || 0.25);
    // Meldingen boven gebouwen zonder voorziening.
    const n: Record<Nut, number> = { stroom: 0, water: 0, riool: 0, afval: 0 };
    const q = cam.quaternion, p = new THREE.Vector3(), s = new THREE.Vector3();
    for (const [id, mis] of this.w.voorzieningen.tekort) {
      const g = this.w.gebouwen.get(id);
      if (!g) continue;
      // Eén icoon per gebouw: het belangrijkste tekort.
      const nut = (['stroom', 'water', 'riool', 'afval'] as Nut[]).find(x => mis.has(x))!;
      p.set(g.centrum.x, g.y + totaleHoogte(g.lagen) + 4, g.centrum.z);
      const af = p.distanceTo(cam.position);
      const k = Math.min(60, Math.max(3.5, af * 0.035));
      p.y += k * 0.6;
      s.set(k, k, k);
      this.m.compose(p, q, s);
      this.iconen[nut].setMatrixAt(n[nut]++, this.m);
    }
    for (const x of Object.keys(n) as Nut[]) { this.iconen[x].count = n[x]; this.iconen[x].visible = n[x] > 0; this.iconen[x].instanceMatrix.needsUpdate = true; }
    // Branden: vlammen die met de ernst meegroeien en flakkeren, rook die opstijgt en uitwaaiert.
    this.tijd += dt;
    let nv = 0, nr = 0;
    for (const inc of this.w.hulpdiensten.incidenten.values()) {
      if (inc.soort !== 'brand') continue;
      const g = this.w.gebouwen.get(inc.gebouw);
      if (!g) continue;
      const top = g.y + totaleHoogte(g.lagen);
      const e = Math.min(1, inc.ernst);
      const zaad = inc.id * 1.7;
      for (let k = 0; k < 10 && nv < 2000; k++) {
        const a = zaad + k * 2.4;
        const ox = Math.cos(a) * g.breedte * 0.3, oz = Math.sin(a) * 5;
        const fl = 0.75 + 0.25 * Math.sin(this.tijd * 9 + k * 1.3);
        const h = (5 + e * 14) * fl;
        p.set(g.centrum.x + ox, top - 1 + h * 0.45, g.centrum.z + oz);
        s.set(h * 0.6, h, h * 0.6);
        this.m.compose(p, q, s);
        this.vlam.setMatrixAt(nv++, this.m);
      }
      for (let k = 0; k < 14 && nr < 2000; k++) {
        const fase = (this.tijd * 0.12 + k / 14 + zaad) % 1;
        const hgt = fase * (25 + 45 * e);
        p.set(g.centrum.x + fase * 12 + Math.sin(k + this.tijd * 0.5) * 3, top + 4 + hgt, g.centrum.z + fase * 6);
        const gr = (7 + fase * 26) * (0.5 + e);
        s.set(gr, gr, gr);
        this.m.compose(p, q, s);
        this.rook.setMatrixAt(nr++, this.m);
      }
    }
    this.vlam.count = nv; this.vlam.visible = nv > 0; this.vlam.instanceMatrix.needsUpdate = true;
    this.rook.count = nr; this.rook.visible = nr > 0; this.rook.instanceMatrix.needsUpdate = true;
    return veranderd;
  }
}
