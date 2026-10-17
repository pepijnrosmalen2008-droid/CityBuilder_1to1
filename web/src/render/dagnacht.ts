import * as THREE from 'three';
import { Sfeer } from './sfeer';
import { Materialen, NACHT } from './materialen';

// ════════════════════════════════════════════════════════════════════════════════════
// DAG EN NACHT
// Zoals in Cities: Skylines: de zon komt op in het oosten en gaat onder in het westen, met warm
// licht bij zonsopkomst en -ondergang; 's nachts maanlicht, verlichte ramen, etalages, lantaarns
// met lichtvlekken en koplampen. Eén waarde `NACHT` (0 = dag, 1 = nacht) stuurt alle materialen.
// Een etmaal duurt 12 minuten bij normale snelheid; de tijd staat stil als het spel gepauzeerd is.
// ════════════════════════════════════════════════════════════════════════════════════

const ETMAAL_SECONDEN = 12 * 60;
const C = (h: number) => new THREE.Color(h);
const LUCHT_DAG = C(0xbcd6ff), LUCHT_NACHT = C(0x1b2a48), GROND_DAG = C(0x4d4a32), GROND_NACHT = C(0x0d0f14);
const NEVEL_DAG = C(0xa9c4e2), NEVEL_SCHEMER = C(0xd9a98c), NEVEL_NACHT = C(0x0c121c);
const ZON_LAAG = C(0xff9a5a), ZON_HOOG = C(0xffe7c4), MAAN = C(0x8fa8d8);

export class DagNacht {
  /** Uur van de dag (0-24). */
  uur: number;
  /** false = altijd dag (instelling). */
  aan = true;
  private vorigeRichting = new THREE.Vector3();
  private tmp = new THREE.Color();

  constructor(private sfeer: Sfeer, private mats: Materialen, uur = 10) { this.uur = uur; }

  /** Tijd laten lopen (snelheid = spelsnelheid; 0 = pauze) en alles bijwerken. Geeft true als de schaduw opnieuw moet. */
  stap(dt: number, snelheid: number): boolean {
    if (this.aan) this.uur = (this.uur + dt * snelheid * 24 / ETMAAL_SECONDEN) % 24;
    return this.pasToe(this.aan ? this.uur : 13);
  }

  uurTekst() { const u = this.aan ? this.uur : 13; return `${String(Math.floor(u)).padStart(2, '0')}:${String(Math.floor((u % 1) * 60)).padStart(2, '0')}`; }

  private pasToe(uur: number): boolean {
    const s = this.sfeer;
    // Zonnestand: opkomst 6:00 in het oosten (+x), hoogste stand 12:00 in het zuiden (+z), onder om 18:00 in het westen.
    const hoek = (uur - 6) / 12 * Math.PI;
    const elev = THREE.MathUtils.degToRad(52) * Math.sin(hoek);
    const az = THREE.MathUtils.degToRad(90 - (uur - 6) * 15);
    const zon = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elev, az);
    const elevGr = THREE.MathUtils.radToDeg(elev);
    const dag = THREE.MathUtils.smoothstep(elevGr, -4, 10);
    const nacht = 1 - THREE.MathUtils.smoothstep(elevGr, -10, 2);
    const schemer = Math.max(0, 1 - Math.abs(elevGr - 2) / 10);
    NACHT.value = nacht;
    // Licht: zon overdag, maan ('s nachts, tegenover de zon); bij de horizon zijn beide zwak.
    const maanRichting = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - Math.max(0.35, -elev * 0.8), az + Math.PI);
    const richting = elevGr > -3 ? zon : maanRichting;
    s.zonRichting.copy(richting);
    s.zon.intensity = elevGr > -3 ? 3.4 * dag : 0.9 * nacht;
    s.zon.color.copy(elevGr > -3 ? this.tmp.copy(ZON_LAAG).lerp(ZON_HOOG, THREE.MathUtils.smoothstep(elevGr, 0, 30)) : MAAN);
    s.hemi.intensity = 0.3 + 0.12 * dag;
    s.hemi.color.copy(LUCHT_NACHT).lerp(LUCHT_DAG, dag);
    s.hemi.groundColor.copy(GROND_NACHT).lerp(GROND_DAG, dag);
    s.scene.environmentIntensity = 0.12 + 0.33 * dag;
    const u = s.sky.material.uniforms;
    u.sunPosition.value.copy(zon);
    u.rayleigh.value = 2.1 + schemer * 0.8;
    u.turbidity.value = 2.2 + schemer * 4;
    const f = s.scene.fog as THREE.Fog;
    f.color.copy(NEVEL_NACHT).lerp(NEVEL_DAG, dag).lerp(NEVEL_SCHEMER, schemer * 0.55);
    s.renderer.toneMappingExposure = 1.0 + nacht * 0.15;
    s.zetGloed(0.12 + nacht * 0.22, 0.92 - nacht * 0.1);
    // Lampen: lantaarns, koplampen en achterlichten branden 's nachts.
    const lamp = this.mats.haal('lamp'); lamp.emissiveIntensity = 0.4 + 2.2 * nacht;
    const kop = this.mats.haal('koplamp'); kop.emissive.setRGB(1, 0.95, 0.85); kop.emissiveIntensity = 0.35 + 3.5 * nacht;
    const ach = this.mats.haal('achterlicht'); ach.emissive.setRGB(1, 0.02, 0.01); ach.emissiveIntensity = 0.18 + 1.6 * nacht;
    // Schaduw opnieuw als de lichtrichting merkbaar draaide.
    if (richting.angleTo(this.vorigeRichting) > 0.007) { this.vorigeRichting.copy(richting); return true; }
    return false;
  }
}
