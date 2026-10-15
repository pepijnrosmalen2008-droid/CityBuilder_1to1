import * as THREE from 'three';
import { materiaal } from '../core/materialen';
import { TextuurBron } from './texturen';

/** MatDef (engine-onafhankelijk) → three.js-materiaal. Texturen komen later binnen uit de workers. */
export class Materialen {
  private cache = new Map<string, THREE.MeshStandardMaterial>();
  constructor(private bron: TextuurBron) {}

  haal(sleutel: string): THREE.MeshStandardMaterial {
    let m = this.cache.get(sleutel);
    if (m) return m;
    const d = materiaal(sleutel);
    m = sleutel === 'autolak'
      // Autolak: metallic basislaag met een blanke laklaag erover.
      ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color().setRGB(...d.kleur, THREE.SRGBColorSpace), roughness: d.ruwheid, metalness: d.metaal, clearcoat: 1, clearcoatRoughness: 0.06 })
      : new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...d.kleur, THREE.SRGBColorSpace), roughness: d.ruwheid, metalness: d.metaal });
    m.name = sleutel;
    if (d.dubbelzijdig) m.side = THREE.DoubleSide;
    if (d.alfa === 'knip') { m.alphaTest = 0.5; m.transparent = false; m.alphaToCoverage = true; }
    if (d.alfa === 'mengen') { m.transparent = true; m.depthWrite = false; }
    if (d.emissie) { m.emissive = new THREE.Color(...d.emissie); m.emissiveIntensity = 2.5; }
    if (sleutel.startsWith('blad')) { m.emissive = new THREE.Color(0x0b1a06); m.emissiveIntensity = 1; m.envMapIntensity = 0.6; }
    if (d.bovenop) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4; }
    if (d.tex) {
      // Zolang de textuur er niet is: een rustige grijswaarde in plaats van wit.
      if (d.alfa === 'knip') m.visible = false;
      m.color.multiplyScalar(0.55);
      const mat = m;
      this.bron.haal(d.tex, t => {
        const herhaal = d.meter > 0 ? 1 / d.meter : 1;
        const kloon = (x: THREE.DataTexture) => { if (herhaal === 1) return x; const c = x.clone(); c.repeat.set(herhaal, herhaal); c.needsUpdate = true; return c; };
        mat.map = kloon(t.map);
        if (t.normalMap && d.normaal) { mat.normalMap = kloon(t.normalMap); mat.normalScale.set(d.normaal, d.normaal); }
        if (t.ormMap) { mat.roughnessMap = kloon(t.ormMap); mat.metalnessMap = mat.roughnessMap; mat.roughness = 1; mat.metalness = 1; }
        mat.color.setRGB(...d.kleur, THREE.SRGBColorSpace);
        mat.visible = true;
        mat.needsUpdate = true;
      });
    }
    this.cache.set(sleutel, m);
    return m;
  }
}
