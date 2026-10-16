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
  /** Toetsen die het gereedschap nu zelf gebruikt (Move It: pijltjes, Q/E). */
  negeer: (toets: string) => boolean = () => false;
  private vingers = new Map<number, { x: number; y: number }>();
  /** Aantal vingers op het scherm (voor het gereedschap). */
  get aantalVingers() { return this.vingers.size; }

  constructor(private cam: THREE.PerspectiveCamera, dom: HTMLElement, private t: Terrein) {
    addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (!(e.target instanceof HTMLInputElement) && !e.ctrlKey && !e.metaKey && !this.negeer(k)) this.toetsen.add(k); });
    addEventListener('keyup', e => this.toetsen.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.toetsen.clear());
    dom.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') { this.vingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); dom.setPointerCapture(e.pointerId); return; }
      if (e.button === 1 || e.button === 2) { this.sleep = { knop: e.button, x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); }
    });
    const los = (e: PointerEvent) => { if (e.pointerType === 'touch') { this.vingers.delete(e.pointerId); if (this.vingers.size < 2) this.gebaar = null; return; } if (this.sleep && e.button === this.sleep.knop) this.sleep = null; };
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
        // Grijpen: de grond beweegt mee met de muis.
        this.schuifScherm(e.clientX - dx, e.clientY - dy, e.clientX, e.clientY);
      }
    });
    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('wheel', e => {
      e.preventDefault();
      this.doelAfstand = THREE.MathUtils.clamp(this.doelAfstand * Math.pow(1.0015, e.deltaY), this.minAfstand, this.maxAfstand);
    }, { passive: false });
  }

  /** Gebaar met twee vingers: wordt na een paar pixels vastgezet op één soort, zodat knijpen niet ook kantelt. */
  private gebaar: { soort: 'zoom' | 'draai' | 'kantel' | 'schuif' | null; start: Map<number, { x: number; y: number }> } | null = null;

  /** Aanraakgebaren: één vinger schuift, twee vingers knijpen (zoom), draaien, kantelen of schuiven. */
  private aanraak(e: PointerEvent) {
    const oud = this.vingers.get(e.pointerId);
    if (!oud) return;
    const nieuw = { x: e.clientX, y: e.clientY };
    const lijst = [...this.vingers.entries()];
    if (lijst.length === 1) {
      this.gebaar = null;
      if (this.eenVingerPannen()) this.schuifScherm(oud.x, oud.y, nieuw.x, nieuw.y);
    } else if (lijst.length >= 2) {
      const [a, b] = lijst;
      const andere = a[0] === e.pointerId ? b[1] : a[1];
      const andereId = a[0] === e.pointerId ? b[0] : a[0];
      if (!this.gebaar || !this.gebaar.start.has(e.pointerId) || !this.gebaar.start.has(andereId)) {
        this.gebaar = { soort: null, start: new Map([[e.pointerId, { ...oud }], [andereId, { ...andere }]]) };
      }
      const g = this.gebaar;
      const dOud = Math.hypot(oud.x - andere.x, oud.y - andere.y), dNieuw = Math.hypot(nieuw.x - andere.x, nieuw.y - andere.y);
      const hOud = Math.atan2(oud.y - andere.y, oud.x - andere.x), hNieuw = Math.atan2(nieuw.y - andere.y, nieuw.x - andere.x);
      let dh = hNieuw - hOud; if (dh > Math.PI) dh -= 2 * Math.PI; if (dh < -Math.PI) dh += 2 * Math.PI;
      if (!g.soort) {
        // Soort bepalen uit de totale beweging sinds het begin van het gebaar.
        const s1 = g.start.get(e.pointerId)!, s2 = g.start.get(andereId)!;
        const d0 = Math.hypot(s1.x - s2.x, s1.y - s2.y), d1 = Math.hypot(nieuw.x - andere.x, nieuw.y - andere.y);
        let hoek = Math.atan2(nieuw.y - andere.y, nieuw.x - andere.x) - Math.atan2(s1.y - s2.y, s1.x - s2.x);
        if (hoek > Math.PI) hoek -= 2 * Math.PI; if (hoek < -Math.PI) hoek += 2 * Math.PI;
        const m1 = { x: nieuw.x - s1.x, y: nieuw.y - s1.y }, m2 = { x: andere.x - s2.x, y: andere.y - s2.y };
        const zoom = Math.abs(d1 - d0), draai = Math.abs(hoek) * d0 / 2;
        const samen = m1.y * m2.y > 0 && Math.abs(m1.y) > Math.abs(m1.x) && Math.abs(m2.y) > 4;
        const verschuif = Math.hypot((m1.x + m2.x) / 2, (m1.y + m2.y) / 2);
        const max = Math.max(zoom, draai, verschuif);
        if (max > 14) g.soort = zoom === max ? 'zoom' : draai === max ? 'draai' : samen ? 'kantel' : 'schuif';
      }
      const dy = (nieuw.y - oud.y) / 2;
      switch (g.soort) {
        case 'zoom':
          // Iets gevoeliger dan 1:1, zodat je met één knijpbeweging ver komt.
          if (dOud > 10 && dNieuw > 10) this.doelAfstand = THREE.MathUtils.clamp(this.doelAfstand * Math.pow(dOud / dNieuw, 1.6), this.minAfstand, this.maxAfstand);
          this.schuifScherm(oud.x / 2 + andere.x / 2, oud.y / 2 + andere.y / 2, nieuw.x / 2 + andere.x / 2, nieuw.y / 2 + andere.y / 2);
          break;
        case 'draai': this.yaw += dh; break;
        case 'kantel': this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.005, THREE.MathUtils.degToRad(10), THREE.MathUtils.degToRad(88)); break;
        case 'schuif': this.schuifScherm(oud.x / 2 + andere.x / 2, oud.y / 2 + andere.y / 2, nieuw.x / 2 + andere.x / 2, nieuw.y / 2 + andere.y / 2); break;
      }
    }
    this.vingers.set(e.pointerId, nieuw);
  }

  /** Zoomen met een knop (factor < 1 = dichterbij). */
  zoomStap(factor: number) { this.doelAfstand = THREE.MathUtils.clamp(this.doelAfstand * factor, this.minAfstand, this.maxAfstand); }

  /** Grondpunt (vlak op doelhoogte) onder schermpunt (x, y). */
  private grondOnder(x: number, y: number): THREE.Vector3 | null {
    this.cam.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), this.cam);
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.doel.y), p) ? p : null;
  }

  /** Grijpen: het grondpunt onder (x0, y0) komt onder (x1, y1) te liggen. */
  private schuifScherm(x0: number, y0: number, x1: number, y1: number) {
    const a = this.grondOnder(x0, y0), b = this.grondOnder(x1, y1);
    if (a && b && a.distanceTo(b) < this.afstand * 3) { this.doel.x += a.x - b.x; this.doel.z += a.z - b.z; this.pasToe(); return; }
    this.schuif(x1 - x0, y1 - y0);
  }

  private schuif(dx: number, dy: number) {
    const s = this.afstand / Math.max(400, innerHeight) * 0.8;
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), r = new THREE.Vector3(f.z, 0, -f.x);
    // Grijpen: de grond volgt je vinger.
    this.doel.addScaledVector(r, -dx * s).addScaledVector(f, -dy * s);
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
    if (k.has('d') || k.has('arrowright')) v.add(r);
    if (k.has('a') || k.has('arrowleft')) v.sub(r);
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
