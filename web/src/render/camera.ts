import * as THREE from 'three';
import { Terrein } from '../core/terrain';

/** Stadscamera zoals in Cities: Skylines: draaipunt op het maaiveld, zoomen tot op straatniveau,
 *  pannen sneller naarmate je verder weg bent. WASD/pijlen of middelste knop = pannen,
 *  Q/E of rechts slepen = draaien, R/F of rechts slepen verticaal = kantelen, wiel = zoomen. */
export class StadCamera {
  doel = new THREE.Vector3(0, 0, 0);
  yaw = THREE.MathUtils.degToRad(30);
  pitch = THREE.MathUtils.degToRad(48);
  afstand = 520;
  private doelAfstand = 520;
  private toetsen = new Set<string>();
  private sleep: { knop: number; x: number; y: number } | null = null;
  minAfstand = 10; maxAfstand = 2200;
  /** Mag één vinger de kaart schuiven? (niet tijdens zones schilderen) */
  eenVingerPannen: () => boolean = () => true;
  private vingers = new Map<number, { x: number; y: number }>();
  /** Aantal vingers op het scherm (voor het gereedschap). */
  get aantalVingers() { return this.vingers.size; }

  constructor(private cam: THREE.PerspectiveCamera, dom: HTMLElement, private t: Terrein) {
    addEventListener('keydown', e => { if (!(e.target instanceof HTMLInputElement)) this.toetsen.add(e.key.toLowerCase()); });
    addEventListener('keyup', e => this.toetsen.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.toetsen.clear());
    dom.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') { this.vingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); dom.setPointerCapture(e.pointerId); return; }
      if (e.button === 1 || e.button === 2) { this.sleep = { knop: e.button, x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); }
    });
    const los = (e: PointerEvent) => { if (e.pointerType === 'touch') { this.vingers.delete(e.pointerId); return; } if (this.sleep && e.button === this.sleep.knop) this.sleep = null; };
    dom.addEventListener('pointerup', los);
    dom.addEventListener('pointercancel', los);
    dom.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') { this.aanraak(e); return; }
      if (!this.sleep) return;
      const dx = e.clientX - this.sleep.x, dy = e.clientY - this.sleep.y;
      this.sleep.x = e.clientX; this.sleep.y = e.clientY;
      if (this.sleep.knop === 2) {
        this.yaw -= dx * 0.005;
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, THREE.MathUtils.degToRad(10), THREE.MathUtils.degToRad(88));
      } else {
        const s = this.afstand / 900;
        const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), r = new THREE.Vector3(f.z, 0, -f.x);
        this.doel.addScaledVector(r, dx * s * 1.6).addScaledVector(f, dy * s * 1.6);
      }
    });
    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('wheel', e => {
      e.preventDefault();
      this.doelAfstand = THREE.MathUtils.clamp(this.doelAfstand * Math.pow(1.0015, e.deltaY), this.minAfstand, this.maxAfstand);
    }, { passive: false });
  }

  /** Aanraakgebaren: één vinger schuift, twee vingers knijpen (zoom), draaien, kantelen en schuiven. */
  private aanraak(e: PointerEvent) {
    const oud = this.vingers.get(e.pointerId);
    if (!oud) return;
    const nieuw = { x: e.clientX, y: e.clientY };
    const lijst = [...this.vingers.entries()];
    if (lijst.length === 1) {
      if (this.eenVingerPannen()) this.schuif(nieuw.x - oud.x, nieuw.y - oud.y);
    } else if (lijst.length >= 2) {
      const [a, b] = lijst;
      const andere = a[0] === e.pointerId ? b[1] : a[1];
      const dOud = Math.hypot(oud.x - andere.x, oud.y - andere.y), dNieuw = Math.hypot(nieuw.x - andere.x, nieuw.y - andere.y);
      if (dOud > 10 && dNieuw > 10) this.doelAfstand = THREE.MathUtils.clamp(this.doelAfstand * dOud / dNieuw, this.minAfstand, this.maxAfstand);
      const hOud = Math.atan2(oud.y - andere.y, oud.x - andere.x), hNieuw = Math.atan2(nieuw.y - andere.y, nieuw.x - andere.x);
      let dh = hNieuw - hOud; if (dh > Math.PI) dh -= 2 * Math.PI; if (dh < -Math.PI) dh += 2 * Math.PI;
      this.yaw += dh;
      // Beide vingers dezelfde kant op: kantelen (verticaal) of schuiven (half, per vinger).
      const dx = (nieuw.x - oud.x) / 2, dy = (nieuw.y - oud.y) / 2;
      const sameV = Math.abs(dy) > Math.abs(dx) * 1.5;
      if (sameV) this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, THREE.MathUtils.degToRad(10), THREE.MathUtils.degToRad(88));
      else this.schuif(dx, dy);
    }
    this.vingers.set(e.pointerId, nieuw);
  }

  private schuif(dx: number, dy: number) {
    const s = this.afstand / Math.max(400, innerHeight) * 1.3;
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), r = new THREE.Vector3(f.z, 0, -f.x);
    this.doel.addScaledVector(r, dx * s).addScaledVector(f, dy * s);
  }

  zet(x: number, z: number, afstand: number, yawGraden?: number, pitchGraden?: number) {
    this.doel.set(x, this.t.hoogte(x, z), z);
    this.afstand = this.doelAfstand = afstand;
    if (yawGraden !== undefined) this.yaw = THREE.MathUtils.degToRad(yawGraden);
    if (pitchGraden !== undefined) this.pitch = THREE.MathUtils.degToRad(pitchGraden);
    this.pasToe();
  }

  stap(dt: number) {
    const k = this.toetsen;
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), r = new THREE.Vector3(f.z, 0, -f.x);
    const v = new THREE.Vector3();
    // Camera kijkt in de richting -f (van achter het doel), dus vooruit = -f.
    if (k.has('w') || k.has('arrowup')) v.sub(f);
    if (k.has('s') || k.has('arrowdown')) v.add(f);
    if (k.has('d') || k.has('arrowright')) v.sub(r);
    if (k.has('a') || k.has('arrowleft')) v.add(r);
    if (v.lengthSq() > 0) this.doel.addScaledVector(v.normalize(), dt * THREE.MathUtils.clamp(this.afstand * 1.1, 25, 1600));
    if (k.has('q')) this.yaw += dt * 1.4;
    if (k.has('e')) this.yaw -= dt * 1.4;
    if (k.has('r')) this.pitch = Math.min(THREE.MathUtils.degToRad(88), this.pitch + dt * 0.8);
    if (k.has('f')) this.pitch = Math.max(THREE.MathUtils.degToRad(10), this.pitch - dt * 0.8);
    const g = this.t.grootte / 2;
    this.doel.x = THREE.MathUtils.clamp(this.doel.x, -g, g); this.doel.z = THREE.MathUtils.clamp(this.doel.z, -g, g);
    this.doel.y += (Math.max(0, this.t.hoogte(this.doel.x, this.doel.z)) - this.doel.y) * Math.min(1, dt * 6);
    this.afstand += (this.doelAfstand - this.afstand) * Math.min(1, dt * 10);
    this.pasToe();
  }

  private pasToe() {
    const cp = Math.cos(this.pitch);
    const pos = new THREE.Vector3(this.doel.x + Math.sin(this.yaw) * cp * this.afstand, this.doel.y + Math.sin(this.pitch) * this.afstand, this.doel.z + Math.cos(this.yaw) * cp * this.afstand);
    const grond = Math.max(this.t.hoogte(pos.x, pos.z), 0) + 2;
    if (pos.y < grond) pos.y = grond;
    this.cam.position.copy(pos);
    this.cam.lookAt(this.doel);
  }
}
