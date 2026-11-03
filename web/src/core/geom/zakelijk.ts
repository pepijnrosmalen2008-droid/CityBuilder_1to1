import { V2 } from '../math';
import { Rng } from '../rng';
import { Gebouw } from '../wereld';
import { MeshBouwer } from './mesh';
import { cilinder } from './props';
import { LOD } from './lod';
import { Rand, randen, doos, P3, N3, inzet } from './gebouwmesh';
import { dakkasten, luifel } from './detail';
import { AANTAL_LOGOS } from '../tex/generatoren';
import { getekendOppervlak, zwaartepunt } from '../poly';

// ════════════════════════════════════════════════════════════════════════════════════
// KANTOREN EN BEDRIJFSHALLEN: GEVELOPBOUW
// Alleen voor de detailmesh (dichtbij): vinnen langs glasgevels, bedrijfslogo's, daktechniek,
// entreeluifels; bij hallen kolommen, dockshelters, dakinstallaties en hemelwaterafvoeren.
// ════════════════════════════════════════════════════════════════════════════════════

const op = (x: Rand, s: number, d: number): V2 => ({ x: x.a.x + x.t.x * s + x.n.x * d, z: x.a.z + x.t.z * s + x.n.z * d });

/** Uitstekende strook langs de gevel (vin, kolom): voorkant en twee zijkanten, 6 driehoeken. */
function vin(mb: MeshBouwer, mat: string, x: Rand, s: number, b: number, diep: number, y0: number, y1: number) {
  const a0 = op(x, s - b / 2, 0), b0 = op(x, s + b / 2, 0), a1 = op(x, s - b / 2, diep), b1 = op(x, s + b / 2, diep);
  mb.quad(mat, P3(a1, y0), P3(b1, y0), P3(b1, y1), P3(a1, y1), [0, 0], [1, 0], [1, 1], [0, 1], N3(x.n));
  mb.quad(mat, P3(a0, y0), P3(a1, y0), P3(a1, y1), P3(a0, y1), [0, 0], [1, 0], [1, 1], [0, 1], { x: -x.t.x, y: 0, z: -x.t.z });
  mb.quad(mat, P3(b0, y0), P3(b1, y0), P3(b1, y1), P3(b0, y1), [0, 0], [1, 0], [1, 1], [0, 1], { x: x.t.x, y: 0, z: x.t.z });
}

/** Bedrijfsnaam als los bord voor de gevel (tekst leest altijd van links naar rechts). */
function naambord(mb: MeshBouwer, x: Rand, s: number, breed: number, y: number, variant: number) {
  const h = breed / 4, a = op(x, s - breed / 2, 0.12), b = op(x, s + breed / 2, 0.12);
  const recht = x.t.x * x.n.z - x.t.z * x.n.x >= 0;
  const [u0, u1] = recht ? [0, 1] : [1, 0];
  mb.quad(`logo:${variant % AANTAL_LOGOS}`, P3(a, y), P3(b, y), P3(b, y + h), P3(a, y + h), [u0, 0], [u1, 0], [u1, 1], [u0, 1], N3(x.n));
}

/** Kantoortoren: vinnen, logo, techniekruimte, antennes en een entreeluifel. */
export function torenDetail(mb: MeshBouwer, g: Gebouw, delen: { poly: V2[]; y0: number; y1: number }[], glas: boolean) {
  if (LOD.ver) return;
  const r = new Rng(g.seed + 911);
  // Verticale vinnen langs de verdiepingen (glasgevels): schaduwlijnen zoals bij echte vliesgevels.
  if (glas) for (const d of delen) for (const x of randen(g, d.poly)) {
    const n = Math.max(1, Math.round(x.L / 3.6));
    for (let i = 1; i < n; i++) vin(mb, 'paal', x, i * x.L / n, 0.08, 0.3, d.y0, d.y1 - 0.2);
  }
  const top = delen[delen.length - 1], rdTop = randen(g, top.poly);
  const voor = rdTop.filter(x => x.soort === 'voor').sort((a, b) => b.L - a.L)[0] ?? rdTop.sort((a, b) => b.L - a.L)[0];
  if (voor && voor.L > 10 && top.y1 - top.y0 > 6) {
    const breed = Math.min(voor.L * 0.6, 16);
    naambord(mb, voor, voor.L / 2, breed, top.y1 - 1.2 - breed / 4, g.seed);
  }
  // Daktechniek: ingezette techniekruimte met louvres, luchtbehandeling, antennes.
  const kern = inzet(top.poly, 4);
  if (Math.abs(getekendOppervlak(kern)) > 60) {
    const c = zwaartepunt(kern), t = voor?.t ?? { x: 1, z: 0 };
    doos(mb, 'golfplaat:2', 'dakgrind', c, t, 7, 5, top.y1, top.y1 + 3.6);
    dakkasten(mb, { x: c.x + t.x * 6, z: c.z + t.z * 6 }, t, 6, 6, top.y1, r, 3);
    for (const k of [-1, 1]) {
      const a = { x: c.x - t.x * 2.5 * k - t.z * 1.5, z: c.z - t.z * 2.5 * k + t.x * 1.5 };
      cilinder(mb, 'metaal', P3(a, top.y1 + 3.6), P3(a, top.y1 + 3.6 + r.range(4, 9)), 0.08, 0.04, 5);
    }
    // Gevelonderhoudsrail rond de dakrand.
    for (const x of rdTop) vin(mb, 'metaal', x, x.L / 2, x.L - 1.5, -1.2, top.y1 + 1.1, top.y1 + 1.2);
  }
  // Entreeluifel aan de langste voorgevel van de sokkel.
  const rd0 = randen(g, delen[0].poly).filter(x => x.soort === 'voor').sort((a, b) => b.L - a.L)[0];
  if (rd0 && rd0.L > 8) luifel(mb, op(rd0, rd0.L / 2, 0), rd0.t, 7, 2.6, delen[0].y0, 3.8, 'metaal');
}

/** Bedrijfshal: kolommen, dockshelters met lampen, naam op de gevel, dakinstallaties, regenpijpen. */
export function halDetail(mb: MeshBouwer, g: Gebouw, Y: number, H: number, kop: number) {
  if (LOD.ver) return;
  const r = new Rng(g.seed + 377), rd = randen(g);
  for (const x of rd) {
    // Stalen kolommen elke ~6 m en hemelwaterafvoeren op de hoeken.
    const n = Math.max(1, Math.round(x.L / 6));
    for (let i = 1; i < n; i++) vin(mb, 'trimDonker', x, i * x.L / n, 0.3, 0.18, Y, H - 0.3);
    const p = op(x, 0.35, 0.12);
    cilinder(mb, 'metaal', P3(p, Y), P3(p, H - 0.1), 0.06, 0.06, 6);
  }
  for (const x of rd.filter(q => q.soort === 'voor')) {
    // Dockshelters rond de roldeuren (zelfde ritme als in hal()).
    for (let s = kop + 3; s + 2 < x.L; s += 5.5) {
      vin(mb, 'rubber', x, s - 1.95, 0.3, 0.6, Y + 1.1, Y + 4.4);
      vin(mb, 'rubber', x, s + 1.95, 0.3, 0.6, Y + 1.1, Y + 4.4);
      vin(mb, 'rubber', x, s, 4.2, 0.6, Y + 4.2, Y + 4.6);
      vin(mb, 'politieoranje', x, s + 2.5, 0.12, 0.25, Y + 3.6, Y + 3.75);
    }
    if (x.L > 14) naambord(mb, x, Math.min(x.L - 6, kop + (x.L - kop) / 2), Math.min(12, (x.L - kop) * 0.6), Math.max(Y + 5.2, H - 3.2), g.seed + 3);
  }
  // Dakinstallaties.
  const c = zwaartepunt(g.voet), voor = rd.find(q => q.soort === 'voor');
  const t = voor?.t ?? { x: 1, z: 0 };
  dakkasten(mb, c, t, 14, 10, H, r, 5);
  for (let i = 0; i < 3; i++) {
    const p = { x: c.x + t.x * (i - 1) * 9 + t.z * 6, z: c.z + t.z * (i - 1) * 9 - t.x * 6 };
    cilinder(mb, 'metaal', P3(p, H), P3(p, H + 1.4), 0.45, 0.45, 10);
    cilinder(mb, 'trimDonker', P3(p, H + 1.4), P3(p, H + 1.6), 0.6, 0.6, 10);
  }
}
