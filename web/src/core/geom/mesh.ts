import { V3, cross3, dot3, norm3, sub3 } from '../math';

/** Eén submesh per materiaal. UV's zijn in meters (of in een vaste textuurlayout, zie materialen.ts). */
export interface MeshGroep { materiaal: string; posities: Float32Array; normalen: Float32Array; uvs: Float32Array; indices: Uint32Array }
export interface MeshData { groepen: MeshGroep[] }

/** Losse objecten die de render-laag als instanties tekent (bomen, lantaarns, ...). */
export interface Prop { soort: string; x: number; y: number; z: number; rot: number; schaal: number; variant: number }

class Buffer { p: number[] = []; n: number[] = []; uv: number[] = []; i: number[] = [] }

/** Engine-onafhankelijke meshbouwer. Elk vlak krijgt eigen hoekpunten (harde randen); de
 *  wikkeling wordt per vlak gecontroleerd tegen een "buiten"-vector, zodat de voorkant altijd
 *  naar buiten wijst (rechtsdraaiend, tegen de klok in = voorkant, zoals three.js en glTF). */
export class MeshBouwer {
  private b = new Map<string, Buffer>();

  private buf(m: string) { let x = this.b.get(m); if (!x) this.b.set(m, x = new Buffer()); return x; }

  /** Ruw driehoekje met opgegeven normalen per hoek (voor gladde vormen zoals boomkronen). */
  ruw(m: string, pts: V3[], nrm: V3[], uvs: [number, number][], idx: number[]) {
    const B = this.buf(m), o = B.p.length / 3;
    for (let k = 0; k < pts.length; k++) {
      B.p.push(pts[k].x, pts[k].y, pts[k].z); B.n.push(nrm[k].x, nrm[k].y, nrm[k].z); B.uv.push(uvs[k][0], uvs[k][1]);
    }
    for (const i of idx) B.i.push(o + i);
  }

  driehoek(m: string, a: V3, b: V3, c: V3, ua: [number, number], ub: [number, number], uc: [number, number], buiten?: V3) {
    let n = norm3(cross3(sub3(b, a), sub3(c, a)));
    if (buiten && dot3(n, buiten) < 0) { [b, c] = [c, b]; [ub, uc] = [uc, ub]; n = { x: -n.x, y: -n.y, z: -n.z }; }
    this.ruw(m, [a, b, c], [n, n, n], [ua, ub, uc], [0, 1, 2]);
  }

  /** Vierhoek a-b-c-d (rondom). */
  quad(m: string, a: V3, b: V3, c: V3, d: V3, ua: [number, number], ub: [number, number], uc: [number, number], ud: [number, number], buiten?: V3) {
    let n = norm3(cross3(sub3(b, a), sub3(c, a)));
    if (n.x === 0 && n.y === 1 && n.z === 0 && Math.abs(cross3(sub3(b, a), sub3(c, a)).y) < 1e-12) n = norm3(cross3(sub3(c, a), sub3(d, a)));
    if (buiten && dot3(n, buiten) < 0) {
      [b, d] = [d, b]; [ub, ud] = [ud, ub]; n = { x: -n.x, y: -n.y, z: -n.z };
    }
    this.ruw(m, [a, b, c, d], [n, n, n, n], [ua, ub, uc, ud], [0, 1, 2, 0, 2, 3]);
  }

  /** Verticale muur van a naar b (op de grond), van y0 tot y1. UV in meters (u langs de muur). */
  muur(m: string, a: V3, b: V3, y0: number, y1: number, buiten: V3, uStart = 0, v0 = y0, v1 = y1) {
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    this.quad(m, { x: a.x, y: y0, z: a.z }, { x: b.x, y: y0, z: b.z }, { x: b.x, y: y1, z: b.z }, { x: a.x, y: y1, z: a.z },
      [uStart, v0], [uStart + L, v0], [uStart + L, v1], [uStart, v1], buiten);
  }

  /** Doos rond centrum (x,z), assen ax/az (genormaliseerd, horizontaal), y0..y1. */
  blok(zijkant: string, top: string, c: V3, ax: V3, az: V3, breedte: number, diepte: number, y0: number, y1: number, bodem = false) {
    const hx = breedte / 2, hz = diepte / 2;
    const P = (u: number, v: number, y: number): V3 => ({ x: c.x + ax.x * u + az.x * v, y, z: c.z + ax.z * u + az.z * v });
    const hoeken: [number, number][] = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
    let uo = 0;
    for (let i = 0; i < 4; i++) {
      const [u0, v0] = hoeken[i], [u1, v1] = hoeken[(i + 1) % 4];
      const a = P(u0, v0, 0), b = P(u1, v1, 0);
      const mid = { x: (a.x + b.x) / 2 - c.x, y: 0, z: (a.z + b.z) / 2 - c.z };
      this.muur(zijkant, a, b, y0, y1, mid, uo);
      uo += Math.hypot(b.x - a.x, b.z - a.z);
    }
    const t = hoeken.map(([u, v]) => P(u, v, y1));
    this.quad(top, t[0], t[1], t[2], t[3], [-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], { x: 0, y: 1, z: 0 });
    if (bodem) {
      const o = hoeken.map(([u, v]) => P(u, v, y0));
      this.quad(top, o[0], o[1], o[2], o[3], [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: -1, z: 0 });
    }
  }

  /** Horizontale strook langs twee lijnen L (links) en R (rechts), met UV u = afstand langs, v = dwars. */
  strook(m: string, L: V3[], R: V3[], s: number[], vL: number, vR: number, omhoog = true) {
    const B = this.buf(m), o = B.p.length / 3;
    const n = L.length;
    for (let i = 0; i < n; i++) {
      // Normaal per rij uit de lokale helling.
      const j = Math.min(n - 1, i + 1), k = Math.max(0, i - 1);
      const t = sub3(L[j], L[k]);
      const dw = sub3(R[i], L[i]);
      let nn = norm3(cross3(dw, t));
      if ((nn.y < 0) === omhoog) nn = { x: -nn.x, y: -nn.y, z: -nn.z };
      B.p.push(L[i].x, L[i].y, L[i].z, R[i].x, R[i].y, R[i].z);
      B.n.push(nn.x, nn.y, nn.z, nn.x, nn.y, nn.z);
      B.uv.push(vL, s[i], vR, s[i]);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = o + i * 2, b = a + 1, c = a + 2, d = a + 3;
      // Controleer de wikkeling van de eerste driehoek t.o.v. de normaal.
      const pa = L[i], pb = R[i], pc = L[i + 1];
      const cr = cross3(sub3(pb, pa), sub3(pc, pa));
      const goed = (cr.y >= 0) === omhoog;
      if (goed) B.i.push(a, b, c, b, d, c); else B.i.push(a, c, b, b, c, d);
    }
  }

  /** Verticale band langs een lijn (stoeprand, brugrand): van onder naar boven per punt. */
  band(m: string, onder: V3[], boven: V3[], s: number[], buiten: V3[]) {
    const B = this.buf(m), o = B.p.length / 3;
    const n = onder.length;
    for (let i = 0; i < n; i++) {
      const nn = norm3(buiten[i]);
      B.p.push(onder[i].x, onder[i].y, onder[i].z, boven[i].x, boven[i].y, boven[i].z);
      B.n.push(nn.x, nn.y, nn.z, nn.x, nn.y, nn.z);
      B.uv.push(s[i], onder[i].y, s[i], boven[i].y);
    }
    for (let i = 0; i < n - 1; i++) {
      const a = o + i * 2, b = a + 1, c = a + 2, d = a + 3;
      const cr = cross3(sub3(onder[i + 1], onder[i]), sub3(boven[i], onder[i]));
      if (dot3(cr, buiten[i]) >= 0) B.i.push(a, c, b, b, c, d); else B.i.push(a, b, c, b, d, c);
    }
  }

  leeg() { return this.b.size === 0; }

  bouw(): MeshData {
    const groepen: MeshGroep[] = [];
    for (const [m, B] of this.b) {
      if (!B.i.length) continue;
      groepen.push({ materiaal: m, posities: new Float32Array(B.p), normalen: new Float32Array(B.n), uvs: new Float32Array(B.uv), indices: new Uint32Array(B.i) });
    }
    return { groepen };
  }
}
