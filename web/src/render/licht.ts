import * as THREE from 'three';
import { PropLaag } from './props';
import { NACHT } from './materialen';

/**
 * Lichtvlekken onder de lantaarns: een zacht, warm verloop op de stoep en de weg (additief, zonder
 * echte lampen: duizenden lichtpunten kosten zo één tekenopdracht). Alleen zichtbaar als het donker is.
 */
export class LichtLaag {
  groep = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private versie = -1;
  private mat: THREE.MeshBasicMaterial;

  constructor(private props: PropLaag, private hoogte: (x: number, z: number) => number) {
    const doek = document.createElement('canvas'); doek.width = doek.height = 128;
    const c = doek.getContext('2d')!;
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,214,160,0.95)'); g.addColorStop(0.35, 'rgba(255,190,120,0.45)'); g.addColorStop(1, 'rgba(255,170,90,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(doek); tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, 1);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; this.mesh.userData.geenAO = true;
    this.groep.add(this.mesh);
  }

  private bouw() {
    const lijst = this.props.verzamel(new Set(['lantaarn', 'lantaarnDubbel', 'lantaarnKlassiek']));
    const plekken: THREE.Vector3[] = [];
    for (const p of lijst) {
      // De lamp hangt 1,7 m van de mast (dubbel: aan beide kanten), gedraaid zoals de prop.
      for (const k of p.soort === 'lantaarnDubbel' ? [1, -1] : [1]) {
        const arm = p.soort === 'lantaarnKlassiek' ? 0 : 1.7;
        const x = p.x + Math.sin(p.rot) * arm * k * p.schaal, z = p.z + Math.cos(p.rot) * arm * k * p.schaal;
        plekken.push(new THREE.Vector3(x, Math.max(p.y, this.hoogte(x, z)) + 0.12, z));
      }
    }
    this.groep.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = new THREE.InstancedMesh(this.mesh.geometry, this.mat, Math.max(1, plekken.length));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; this.mesh.userData.geenAO = true;
    const m = new THREE.Matrix4(), s = new THREE.Vector3(13, 1, 13), q = new THREE.Quaternion();
    plekken.forEach((p, i) => this.mesh.setMatrixAt(i, m.compose(p, q, s)));
    this.mesh.count = plekken.length;
    this.groep.add(this.mesh);
  }

  werkBij() {
    const n = NACHT.value;
    this.groep.visible = n > 0.03;
    if (!this.groep.visible) return;
    if (this.props.versie !== this.versie) { this.versie = this.props.versie; this.bouw(); }
    this.mat.opacity = Math.min(1, n * 1.2) * 0.32;
  }
}
