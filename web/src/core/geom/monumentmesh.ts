import { V2, V3 } from '../math';
import { MeshBouwer, Prop } from './mesh';
import { cilinder } from './props';
import { koepel } from './stadshart';
import { gebouwBlok, vlaggenmast } from './detail';
import { Rng } from '../rng';

// ════════════════════════════════════════════════════════════════════════════════════
// MONUMENTEN
// Gotische kathedraal, koepelgebouw (zoals het Panthéon), stadhuis met klokkentoren en een
// fonteinplein. Assen zoals bij de andere voorzieningen: a langs de weg, c naar de weg toe
// (c = +D/2 is de voorkant). Ware maten: de torens van de kathedraal zijn 84 m hoog.
// ════════════════════════════════════════════════════════════════════════════════════

type H = (x: number, z: number) => number;

export interface Kader {
  mb: MeshBouwer; props: Prop[]; r: Rng; hoogte: H;
  P: (a: number, c: number) => V2; u: V2; v: V2; Y: number;
}

const MUUR = 'muur:kalksteen', STEEN = 'natuursteen', WIT = 'natuursteenWit';

const p3 = (K: Kader, a: number, c: number, y: number): V3 => { const q = K.P(a, c); return { x: q.x, y, z: q.z }; };
const dir = (K: Kader, da: number, dc: number, dy = 0): V3 => ({ x: K.u.x * da + K.v.x * dc, y: dy, z: K.u.z * da + K.v.z * dc });

function doosK(K: Kader, zij: string, top: string, a: number, c: number, b: number, d: number, y0: number, y1: number) {
  const m = K.P(a, c);
  K.mb.blok(zij, top, { x: m.x, y: 0, z: m.z }, { x: K.u.x, y: 0, z: K.u.z }, { x: K.v.x, y: 0, z: K.v.z }, b, d, y0, y1);
}

/** Verticale muur van (a0,c0) naar (a1,c1), voorkant in de richting (na,nc). */
function muurK(K: Kader, mat: string, a0: number, c0: number, a1: number, c1: number, y0: number, y1: number, na: number, nc: number) {
  const L = Math.hypot(a1 - a0, c1 - c0);
  K.mb.quad(mat, p3(K, a0, c0, y0), p3(K, a1, c1, y0), p3(K, a1, c1, y1), p3(K, a0, c0, y1), [0, y0], [L, y0], [L, y1], [0, y1], dir(K, na, nc));
}

/** Spitsboogvenster (of portaal) op een gevel met normaal (na,nc). */
function spitsraam(K: Kader, a: number, c: number, na: number, nc: number, b: number, y0: number, y1: number, mat = 'glasInLood', uit = 0.06) {
  const ta = -nc, tc = na, A = a + na * uit, C = c + nc * uit;
  const l = p3(K, A - ta * b / 2, C - tc * b / 2, 0), rr = p3(K, A + ta * b / 2, C + tc * b / 2, 0);
  const n = dir(K, na, nc);
  K.mb.quad(mat, { ...l, y: y0 }, { ...rr, y: y0 }, { ...rr, y: y1 }, { ...l, y: y1 }, [0, 0], [1, 0], [1, 1], [0, 1], n);
  const top = p3(K, A, C, y1 + b * 0.75);
  K.mb.driehoek(mat, { ...l, y: y1 }, { ...rr, y: y1 }, top, [0, 0], [1, 0], [0.5, 1], n);
}

/** Rond venster (roosvenster, wijzerplaat) op een gevel met normaal (na,nc). */
function rond(K: Kader, a: number, c: number, na: number, nc: number, y: number, r: number, mat: string, uit = 0.06, n = 20) {
  const ta = -nc, tc = na, A = a + na * uit, C = c + nc * uit, N = dir(K, na, nc);
  const m = p3(K, A, C, y);
  for (let i = 0; i < n; i++) {
    const h0 = i / n * Math.PI * 2, h1 = (i + 1) / n * Math.PI * 2;
    const q = (h: number) => { const p = p3(K, A + ta * Math.cos(h) * r, C + tc * Math.cos(h) * r, y + Math.sin(h) * r); return p; };
    K.mb.driehoek(mat, m, q(h0), q(h1), [0.5, 0.5], [0.5 + Math.cos(h0) / 2, 0.5 + Math.sin(h0) / 2], [0.5 + Math.cos(h1) / 2, 0.5 + Math.sin(h1) / 2], N);
  }
}

/** Roosvenster: glas-in-lood met een stenen rand en spaken. */
function roos(K: Kader, a: number, c: number, na: number, nc: number, y: number, r: number) {
  rond(K, a, c, na, nc, y, r * 1.14, WIT, 0.04);
  rond(K, a, c, na, nc, y, r, 'glasInLood', 0.08);
  const ta = -nc, tc = na, A = a + na * 0.1, C = c + nc * 0.1, N = dir(K, na, nc);
  for (let i = 0; i < 8; i++) {
    const h = i / 8 * Math.PI;
    const ca = Math.cos(h) * r, s = Math.sin(h) * r, w = 0.12;
    const q = (f: number, o: number) => p3(K, A + ta * (ca * f - Math.sin(h) * o), C + tc * (ca * f - Math.sin(h) * o), y + s * f + Math.cos(h) * o);
    K.mb.quad(WIT, q(-1, -w), q(1, -w), q(1, w), q(-1, w), [0, 0], [1, 0], [1, 1], [0, 1], N);
  }
  rond(K, a, c, na, nc, y, r * 0.22, WIT, 0.11, 10);
}

/**
 * Zadeldak: nok in de richting `langsC` (true = langs c), midden `m` dwars daarop, van s0 tot s1,
 * breedte w; met gevelvelden in `gevel` aan beide kopse kanten.
 */
function zadeldak(K: Kader, mat: string, gevel: string | null, langsC: boolean, m: number, s0: number, s1: number, w: number, y: number, nok: number) {
  const Q = (dw: number, s: number, h: number) => langsC ? p3(K, m + dw, s, h) : p3(K, s, m + dw, h);
  const D = (dw: number, ds: number, dy: number) => langsC ? dir(K, dw, ds, dy) : dir(K, ds, dw, dy);
  const o = 0.5, L = s1 - s0 + 2 * o, hel = Math.hypot(w / 2 + o, nok - y);
  const y0 = y - o * (nok - y) / (w / 2);
  for (const k of [-1, 1]) {
    K.mb.quad(mat, Q(k * (w / 2 + o), s0 - o, y0), Q(k * (w / 2 + o), s1 + o, y0), Q(0, s1 + o, nok), Q(0, s0 - o, nok), [0, 0], [L, 0], [L, hel], [0, hel], D(k, 0, 1));
  }
  if (gevel) for (const [s, k] of [[s0, -1], [s1, 1]] as const) {
    K.mb.driehoek(gevel, Q(-w / 2, s, y), Q(w / 2, s, y), Q(0, s, nok), [0, y], [w, y], [w / 2, nok], D(0, k, 0));
  }
}

/** Schilddak met plat bovenvlak (mansarde-achtig) over een rechthoek b×d rond (a,c). */
function schilddak(K: Kader, mat: string, a: number, c: number, b: number, d: number, y: number, h: number, inzet: number) {
  const o = [[-b / 2, -d / 2], [b / 2, -d / 2], [b / 2, d / 2], [-b / 2, d / 2]];
  const i = o.map(([x, z]) => [x - Math.sign(x) * inzet, z - Math.sign(z) * inzet]);
  for (let k = 0; k < 4; k++) {
    const [x0, z0] = o[k], [x1, z1] = o[(k + 1) % 4], [X0, Z0] = i[k], [X1, Z1] = i[(k + 1) % 4];
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const L = Math.hypot(x1 - x0, z1 - z0), hel = Math.hypot(inzet, h);
    K.mb.quad(mat, p3(K, a + x0, c + z0, y), p3(K, a + x1, c + z1, y), p3(K, a + X1, c + Z1, y + h), p3(K, a + X0, c + Z0, y + h), [0, 0], [L, 0], [L, hel], [0, hel], dir(K, Math.abs(mx) > Math.abs(mz) ? Math.sign(mx) : 0, Math.abs(mz) >= Math.abs(mx) ? Math.sign(mz) : 0, 1));
  }
  K.mb.quad(mat, ...i.map(([x, z]) => p3(K, a + x, c + z, y + h)) as [V3, V3, V3, V3], [0, 0], [b, 0], [b, d], [0, d], { x: 0, y: 1, z: 0 });
}

const boom = (K: Kader, a: number, c: number, soort?: string) => {
  const q = K.P(a, c);
  K.props.push({ soort: soort ?? K.r.kies(['plataan', 'linde'] as const), x: q.x, y: K.hoogte(q.x, q.z), z: q.z, rot: K.r.range(0, 6.3), schaal: K.r.range(0.8, 1), variant: K.r.int(0, 1) });
};
const prop = (K: Kader, soort: string, a: number, c: number, rot = 0) => {
  const q = K.P(a, c);
  K.props.push({ soort, x: q.x, y: K.hoogte(q.x, q.z), z: q.z, rot: Math.atan2(K.v.x, K.v.z) + rot, schaal: 1, variant: 0 });
};

// ─── Gotische kathedraal ───
export function kathedraal(K: Kader) {
  const { Y } = K;
  const h = 24, nok = Y + 35;
  // Schip, zijbeuken met lessenaarsdaken, steunberen en luchtbogen.
  doosK(K, MUUR, 'zink', 0, 0, 16, 60, Y, Y + h);
  zadeldak(K, 'zink', MUUR, true, 0, -30, 30, 16, Y + h, nok);
  for (const k of [-1, 1]) {
    doosK(K, MUUR, 'zink', k * 11.5, 0, 7, 60, Y, Y + 13);
    K.mb.quad('zink', p3(K, k * 15.3, -30, Y + 12.8), p3(K, k * 15.3, 30, Y + 12.8), p3(K, k * 8, 30, Y + 17), p3(K, k * 8, -30, Y + 17), [0, 0], [60, 0], [60, 8.4], [0, 8.4], dir(K, k, 0, 1.6));
    for (const [c, kc] of [[-30, -1], [30, 1]] as const) K.mb.driehoek(MUUR, p3(K, k * 15, c, Y + 13), p3(K, k * 8, c, Y + 13), p3(K, k * 8, c, Y + 17), [0, 0], [7, 0], [7, 4], dir(K, 0, kc));
    for (let c = -27; c <= 27; c += 6) {
      if (c > -22 && c < -8) continue; // transept
      spitsraam(K, k * 8, c, k, 0, 2.2, Y + 16, Y + 21);
      spitsraam(K, k * 15, c, k, 0, 2.0, Y + 3, Y + 9.5);
    }
    for (let c = -30; c <= 30; c += 6) {
      if (c > -24 && c < -6) continue;
      doosK(K, STEEN, STEEN, k * 16.2, c, 1.6, 1.3, Y, Y + 15);
      cilinder(K.mb, STEEN, p3(K, k * 16.2, c, Y + 15), p3(K, k * 16.2, c, Y + 19), 0.65, 0.05, 4);
      cilinder(K.mb, STEEN, p3(K, k * 16, c, Y + 14), p3(K, k * 8.2, c, Y + 21.5), 0.35, 0.3, 4);
    }
  }
  // Transept met roosvensters.
  doosK(K, MUUR, 'zink', 0, -15, 48, 14, Y, Y + h);
  zadeldak(K, 'zink', MUUR, false, -15, -24, 24, 14, Y + h, nok);
  for (const k of [-1, 1]) {
    roos(K, k * 24, -15, k, 0, Y + 15.5, 3.8);
    for (const c of [-18.5, -11.5]) spitsraam(K, k * 24, c, k, 0, 2.2, Y + 3, Y + 9.5);
    spitsraam(K, k * 24, -15, k, 0, 3.6, Y, Y + 5, 'trimDonker');
  }
  // Viering met toren en spits.
  doosK(K, MUUR, 'zink', 0, -15, 11, 11, Y + h, Y + 42);
  for (const [na, nc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) for (const s of [-2.4, 2.4]) {
    spitsraam(K, na * 5.5 + (nc ? s : 0), -15 + nc * 5.5 + (na ? s : 0), na, nc, 1.5, Y + 35, Y + 39.5, 'trimDonker');
  }
  cilinder(K.mb, 'zink', p3(K, 0, -15, Y + 42), p3(K, 0, -15, Y + 72), 6.2, 0.15, 8);
  cilinder(K.mb, 'goud', p3(K, 0, -15, Y + 72), p3(K, 0, -15, Y + 74.5), 0.2, 0.1, 6);
  // Koor met kooromgang (halve achthoek) en een kegeldak.
  const n = 8, R = 8, rim: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const t = i / n * Math.PI; rim.push([R * Math.cos(t), -30 - R * Math.sin(t)]); }
  for (let i = 0; i < n; i++) {
    const [a0, c0] = rim[i], [a1, c1] = rim[i + 1], ma = (a0 + a1) / 2, mc = (c0 + c1) / 2 + 30, l = Math.hypot(ma, mc);
    muurK(K, MUUR, a0, c0, a1, c1, Y, Y + h, ma / l, mc / l);
    spitsraam(K, (a0 + a1) / 2, (c0 + c1) / 2, ma / l, mc / l, 1.7, Y + 5, Y + 19);
    K.mb.driehoek('zink', p3(K, a0, c0, Y + h), p3(K, a1, c1, Y + h), p3(K, 0, -30, nok), [0, 0], [1, 0], [0.5, 1], dir(K, ma / l, mc / l, 1));
    if (i > 0) {
      const [pa, pc] = rim[i];
      const l2 = Math.hypot(pa, pc + 30);
      const q = [pa / l2 * (R + 1.6), -30 + (pc + 30) / l2 * (R + 1.6)];
      cilinder(K.mb, STEEN, p3(K, q[0], q[1], Y), p3(K, q[0], q[1], Y + 15), 0.8, 0.7, 4);
      cilinder(K.mb, STEEN, p3(K, q[0], q[1], Y + 15), p3(K, q[0], q[1], Y + 19), 0.65, 0.05, 4);
      cilinder(K.mb, STEEN, p3(K, q[0], q[1], Y + 14), p3(K, pa * 0.98, -30 + (pc + 30) * 0.98, Y + 21.5), 0.3, 0.25, 4);
    }
  }
  // Westfront: twee torens met spitsen, middendeel met roosvenster, drie portalen.
  doosK(K, MUUR, 'zink', 0, 33, 11.2, 9, Y, Y + 26);
  zadeldak(K, 'zink', MUUR, true, 0, 28.5, 37.5, 11.2, Y + 26, Y + 36);
  roos(K, 0, 37.5, 0, 1, Y + 18.5, 4.2);
  for (const [b, y1, mat, uit] of [[6.4, Y + 8, WIT, 0.04], [5.4, Y + 7.6, STEEN, 0.07], [4.2, Y + 7.2, 'trimDonker', 0.1]] as const) spitsraam(K, 0, 37.5, 0, 1, b, Y, y1, mat, uit);
  for (let a = -4.5; a <= 4.6; a += 1.5) spitsraam(K, a, 37.5, 0, 1, 0.9, Y + 11.6, Y + 13.6, 'trimDonker');
  doosK(K, STEEN, STEEN, 0, 37.6, 11.4, 0.5, Y + 10.8, Y + 11.3);
  for (const k of [-1, 1]) {
    const a = k * 11;
    doosK(K, MUUR, STEEN, a, 34, 11, 11, Y, Y + 50);
    for (const y of [Y + 11, Y + 26, Y + 34]) doosK(K, STEEN, STEEN, a, 34, 11.5, 11.5, y - 0.5, y);
    for (const [b, y1, mat, uit] of [[4.4, Y + 6.5, WIT, 0.04], [3.2, Y + 6, 'trimDonker', 0.08]] as const) spitsraam(K, a, 39.5, 0, 1, b, Y, y1, mat, uit);
    for (const [na, nc] of [[0, 1], [k, 0], [0, -1]] as const) for (const s of [-2.2, 2.2]) {
      const pa = a + na * 5.5 + (nc ? s : 0), pc = 34 + nc * 5.5 + (na ? s : 0);
      spitsraam(K, pa, pc, na, nc, 1.7, Y + 36, Y + 46.5, 'trimDonker');
      spitsraam(K, pa, pc, na, nc, 1.4, Y + 27.5, Y + 32, 'glasInLood');
    }
    for (let i = -1; i <= 1; i += 2) spitsraam(K, a + i * 2.4, 39.5, 0, 1, 1.4, Y + 13, Y + 23, 'glasInLood');
    // Balustrade en pinakels bovenop, dan de spits.
    for (const [x0, z0, x1, z1, na, nc] of [[-5.5, 5.5, 5.5, 5.5, 0, 1], [5.5, -5.5, -5.5, -5.5, 0, -1], [5.5, 5.5, 5.5, -5.5, 1, 0], [-5.5, -5.5, -5.5, 5.5, -1, 0]] as const) {
      K.mb.quad('balustrade', p3(K, a + x0, 34 + z0, Y + 50), p3(K, a + x1, 34 + z1, Y + 50), p3(K, a + x1, 34 + z1, Y + 51.2), p3(K, a + x0, 34 + z0, Y + 51.2), [0, 0], [5, 0], [5, 1], [0, 1], dir(K, na, nc));
    }
    for (const [x, z] of [[-5, -5], [5, -5], [5, 5], [-5, 5]]) cilinder(K.mb, STEEN, p3(K, a + x, 34 + z, Y + 50), p3(K, a + x, 34 + z, Y + 58), 0.7, 0.05, 4);
    cilinder(K.mb, 'zink', p3(K, a, 34, Y + 50), p3(K, a, 34, Y + 84), 4.4, 0.12, 8);
    cilinder(K.mb, 'goud', p3(K, a, 34, Y + 84), p3(K, a, 34, Y + 86), 0.18, 0.08, 6);
  }
  // Voorplein: lantaarns, banken, bomen achter de kerk.
  for (const k of [-1, 1]) {
    prop(K, 'lantaarnKlassiek', k * 9, 45);
    prop(K, 'bank', k * 20, 42, Math.PI);
    for (const c of [-44, -24, 8]) boom(K, k * 24, c);
  }
}

// ─── Koepelgebouw ───
export function koepelgebouw(K: Kader) {
  const { Y, mb } = K;
  gebouwBlok(mb, K.P(0, -6), K.u, 44, 38, Y, Y + 17, 'gevel:kalksteen', { rand: WIT, randH: 1.1, dak: 'zink' });
  doosK(K, WIT, WIT, 0, -6, 45, 39, Y, Y + 1.2);
  // Zuilenportiek met fronton en trappen.
  for (let a = -13; a <= 13.1; a += 26 / 7) {
    cilinder(mb, WIT, p3(K, a, 21.5, Y + 1.6), p3(K, a, 21.5, Y + 14.4), 0.85, 0.72, 12);
    doosK(K, WIT, WIT, a, 21.5, 2, 2, Y + 1.2, Y + 1.6);
    doosK(K, WIT, WIT, a, 21.5, 2, 2, Y + 14.4, Y + 14.9);
  }
  doosK(K, WIT, WIT, 0, 17.5, 30, 10, Y, Y + 1.2);
  doosK(K, WIT, WIT, 0, 17.5, 30.5, 10, Y + 14.9, Y + 17);
  for (let i = 0; i < 2; i++) doosK(K, STEEN, STEEN, 0, 22.85 + i * 0.7, 30, 0.7, Y, Y + 0.8 - i * 0.4);
  zadeldak(K, 'zink', WIT, true, 0, 12.5, 22.5, 30.5, Y + 17, Y + 22.5);
  doosK(K, 'trimDonker', 'trimDonker', 0, 12.6, 5, 0.3, Y + 1.2, Y + 8);
  // Tamboer met zuilenkrans, attiek en de koperen koepel.
  const m = K.P(0, -6), C = (y: number): V3 => ({ x: m.x, y, z: m.z });
  cilinder(mb, MUUR, C(Y + 17), C(Y + 31), 11, 11, 28);
  for (let i = 0; i < 20; i++) {
    const h = i / 20 * Math.PI * 2, q = { x: m.x + Math.cos(h) * 12.2, z: m.z + Math.sin(h) * 12.2 };
    cilinder(mb, WIT, { x: q.x, y: Y + 18, z: q.z }, { x: q.x, y: Y + 28, z: q.z }, 0.45, 0.4, 8);
    const w = { x: m.x + Math.cos(h + Math.PI / 20) * 11.04, z: m.z + Math.sin(h + Math.PI / 20) * 11.04 };
    cilinder(mb, 'raam', { x: w.x, y: Y + 20.5, z: w.z }, { x: w.x, y: Y + 26, z: w.z }, 0.6, 0.6, 4);
  }
  cilinder(mb, WIT, C(Y + 17), C(Y + 18), 13.2, 13.2, 28);
  cilinder(mb, WIT, C(Y + 28), C(Y + 29.4), 13.2, 13.2, 28);
  cilinder(mb, WIT, C(Y + 29.4), C(Y + 29.9), 13.2, 10.8, 28);
  cilinder(mb, MUUR, C(Y + 29.9), C(Y + 32), 10.8, 10.8, 28);
  koepel(mb, 'koper', C(Y + 32), 11, 12.5, 24);
  // Vier kleine koepels op de hoeken.
  for (const [a, c] of [[-19, -22], [19, -22], [-19, 10], [19, 10]]) {
    const q = p3(K, a, c, Y + 17);
    cilinder(mb, MUUR, q, { ...q, y: Y + 20 }, 2.6, 2.6, 12);
    cilinder(mb, WIT, { ...q, y: Y + 20 }, { ...q, y: Y + 20.5 }, 2.9, 2.9, 12);
    koepel(mb, 'koper', { ...q, y: Y + 20.5 }, 2.6, 2.8, 12);
  }
  for (const k of [-1, 1]) {
    vlaggenmast(mb, K.P(k * 18, 26), K.u, Y, k > 0 ? 'politieblauw' : 'remklauw', 10);
    prop(K, 'lantaarnKlassiek', k * 9, 27);
    for (const c of [-26, -10, 6]) boom(K, k * 27, c);
  }
}

// ─── Stadhuis met klokkentoren ───
export function stadhuis(K: Kader) {
  const { Y, mb } = K;
  const G = (a: number, c: number, b: number, d: number, y0: number, y1: number) => gebouwBlok(mb, K.P(a, c), K.u, b, d, y0, y1, 'gevel:kalksteen', { rand: WIT, randH: 0.9, dak: 'zink' });
  // Hoofdvleugel, middenrisaliet en hoekpaviljoens, alle met een schilddak van zink.
  G(0, -3, 50, 24, Y, Y + 15);
  schilddak(K, 'zink', 0, -3, 50.6, 24.6, Y + 15.6, 5, 4);
  for (const k of [-1, 1]) {
    G(k * 24, -3, 11, 28, Y, Y + 17);
    schilddak(K, 'zink', k * 24, -3, 11.6, 28.6, Y + 17.6, 6, 4.2);
    cilinder(mb, 'goud', p3(K, k * 24, -3, Y + 23.6), p3(K, k * 24, -3, Y + 25.5), 0.12, 0.04, 6);
  }
  G(0, 10.5, 16, 5, Y, Y + 17);
  zadeldak(K, 'zink', WIT, true, 0, 8, 13, 16.4, Y + 17.6, Y + 21.5);
  doosK(K, WIT, WIT, 0, 13, 17, 0.2, Y, Y + 1.2);
  // Balkon boven de ingang, ingang met trappen.
  doosK(K, WIT, WIT, 0, 14, 8, 2, Y + 5.6, Y + 5.9);
  K.mb.quad('balustrade', p3(K, -4, 15, Y + 5.9), p3(K, 4, 15, Y + 5.9), p3(K, 4, 15, Y + 6.9), p3(K, -4, 15, Y + 6.9), [0, 0], [4, 0], [4, 1], [0, 1], dir(K, 0, 1));
  doosK(K, 'trimDonker', 'trimDonker', 0, 13.05, 4, 0.2, Y + 0.6, Y + 4.6);
  for (let i = 0; i < 3; i++) doosK(K, STEEN, STEEN, 0, 14 + i * 0.6, 10 - i * 0.6, 0.6, Y, Y + 0.6 - i * 0.2);
  // Klokkentoren: schacht, wijzerplaten, open klokkenstoel, koperen lantaarn en spits.
  const tc = -3, T = 9;
  doosK(K, MUUR, STEEN, 0, tc, T, T, Y + 15, Y + 37);
  doosK(K, WIT, WIT, 0, tc, T + 0.6, T + 0.6, Y + 26.5, Y + 27.2);
  doosK(K, WIT, WIT, 0, tc, T + 0.8, T + 0.8, Y + 36.4, Y + 37.4);
  for (const [na, nc] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const a = na * T / 2, c = tc + nc * T / 2;
    rond(K, a, c, na, nc, Y + 32, 2.9, 'goud', 0.05, 24);
    rond(K, a, c, na, nc, Y + 32, 2.6, WIT, 0.08, 24);
    const ta = -nc, tcc = na, A = a + na * 0.12, Cc = c + nc * 0.12, N = dir(K, na, nc);
    for (const [hoek, len, b] of [[Math.PI / 2 + 0.4, 1.5, 0.14], [Math.PI / 2 - 1.9, 2.2, 0.09]] as const) {
      const ex = Math.cos(hoek), ey = Math.sin(hoek), px = -ey * b, py = ex * b;
      const q = (f: number, s: number) => p3(K, A + ta * (ex * f + px * s), Cc + tcc * (ex * f + px * s), Y + 32 + ey * f + py * s);
      mb.quad('trimDonker', q(0, -1), q(len, -1), q(len, 1), q(0, 1), [0, 0], [1, 0], [1, 1], [0, 1], N);
    }
    for (const s of [-2.2, 2.2]) spitsraam(K, a + ta * s, c + tcc * s, na, nc, 1.2, Y + 19, Y + 24, 'raam');
  }
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) doosK(K, WIT, WIT, x * 3.8, tc + z * 3.8, 1.4, 1.4, Y + 37.4, Y + 43);
  cilinder(mb, 'goud', p3(K, 0, tc, Y + 38), p3(K, 0, tc, Y + 40.5), 1.6, 0.9, 10);
  doosK(K, WIT, 'zink', 0, tc, T + 0.6, T + 0.6, Y + 43, Y + 44.2);
  cilinder(mb, 'koper', p3(K, 0, tc, Y + 44.2), p3(K, 0, tc, Y + 49), 3.6, 2.4, 8);
  koepel(mb, 'koper', p3(K, 0, tc, Y + 49), 2.6, 2.4, 8);
  cilinder(mb, 'koper', p3(K, 0, tc, Y + 52), p3(K, 0, tc, Y + 60), 0.7, 0.05, 8);
  // Vlaggen langs de gevel en een plein met lantaarns.
  for (const a of [-6, 6]) vlaggenmast(mb, K.P(a, 19), K.u, Y, a < 0 ? 'remklauw' : 'politieblauw', 11);
  vlaggenmast(mb, K.P(0, 20), K.u, Y, 'turbinewit', 12);
  for (const k of [-1, 1]) {
    prop(K, 'lantaarnKlassiek', k * 12, 20);
    prop(K, 'bank', k * 20, 18, Math.PI);
    boom(K, k * 30, 18);
  }
}

// ─── Fonteinplein ───
export function fonteinplein(K: Kader) {
  const { Y, mb } = K;
  const m = K.P(0, 0), C = (y: number, dx = 0, dz = 0): V3 => ({ x: m.x + dx, y, z: m.z + dz });
  // Patroon in de bestrating: ring van natuursteen.
  const schijfH = (mat: string, r0: number, r1: number, y: number, n = 40) => {
    for (let i = 0; i < n; i++) {
      const h0 = i / n * Math.PI * 2, h1 = (i + 1) / n * Math.PI * 2;
      const q = (h: number, r: number) => C(y, Math.cos(h) * r, Math.sin(h) * r);
      if (r0 <= 0) mb.driehoek(mat, C(y), q(h0, r1), q(h1, r1), [0, 0], [r1, 0], [0, r1], { x: 0, y: 1, z: 0 });
      else mb.quad(mat, q(h0, r0), q(h0, r1), q(h1, r1), q(h1, r0), [h0 * r0, 0], [h0 * r1, r1 - r0], [h1 * r1, r1 - r0], [h1 * r0, 0], { x: 0, y: 1, z: 0 });
    }
  };
  schijfH(STEEN, 15, 16.2, Y + 0.12);
  schijfH(WIT, 11, 15, Y + 0.11);
  // Bassin: rand, water, schalen op een zuil, beeld en waterstralen.
  cilinder(mb, WIT, C(Y), C(Y + 0.85), 9.2, 9.2, 40);
  cilinder(mb, WIT, C(Y + 0.2), C(Y + 0.85), 8.6, 8.6, 40);
  schijfH(WIT, 8.6, 9.2, Y + 0.85);
  schijfH('fonteinwater', 0, 8.6, Y + 0.62);
  cilinder(mb, WIT, C(Y), C(Y + 2.6), 1.1, 0.8, 14);
  cilinder(mb, WIT, C(Y + 2.4), C(Y + 3.2), 0.8, 3.6, 20);
  schijfH('fonteinwater', 0, 3.4, Y + 3.15, 20);
  cilinder(mb, WIT, C(Y + 3.2), C(Y + 4.9), 0.55, 0.45, 12);
  cilinder(mb, WIT, C(Y + 4.7), C(Y + 5.3), 0.45, 1.7, 14);
  schijfH('fonteinwater', 0, 1.55, Y + 5.25, 14);
  // Beeld: figuur in brons met opgeheven arm.
  cilinder(mb, 'koper', C(Y + 5.3), C(Y + 6.6), 0.42, 0.3, 10);
  cilinder(mb, 'koper', C(Y + 6.6), C(Y + 7.4), 0.3, 0.26, 10);
  cilinder(mb, 'koper', C(Y + 7.4), C(Y + 7.85), 0.17, 0.15, 8);
  cilinder(mb, 'koper', C(Y + 7.2, 0.15), C(Y + 8.4, 0.5), 0.07, 0.06, 6);
  cilinder(mb, 'goud', C(Y + 8.35, 0.5), C(Y + 8.85, 0.55), 0.14, 0.02, 6);
  // Stralen: van de rand in een boog naar het midden, en omlaag uit de bovenste schaal.
  for (let i = 0; i < 12; i++) {
    const h = i / 12 * Math.PI * 2, cx = Math.cos(h), cz = Math.sin(h);
    const a = C(Y + 0.9, cx * 8.3, cz * 8.3), b = C(Y + 2.9, cx * 6.3, cz * 6.3), c = C(Y + 0.65, cx * 4.4, cz * 4.4);
    cilinder(mb, 'straal', a, b, 0.09, 0.07, 5);
    cilinder(mb, 'straal', b, c, 0.07, 0.14, 5);
    if (i % 2 === 0) cilinder(mb, 'straal', C(Y + 5.25, cx * 1.6, cz * 1.6), C(Y + 3.2, cx * 2.3, cz * 2.3), 0.05, 0.12, 4);
    if (i % 3 === 0) cilinder(mb, 'straal', C(Y + 3.15, cx * 3.4, cz * 3.4), C(Y + 0.65, cx * 4.1, cz * 4.1), 0.06, 0.16, 4);
  }
  cilinder(mb, 'straal', C(Y + 8.85, 0.55), C(Y + 11, 0.4), 0.05, 0.03, 5);
  // Bloemperken, banken, lantaarns en platanen langs de rand.
  for (let i = 0; i < 4; i++) {
    const h = i / 4 * Math.PI * 2 + Math.PI / 4, cx = Math.cos(h), cz = Math.sin(h);
    const q = { x: m.x + cx * 19, z: m.z + cz * 19 };
    mb.blok('haag', 'haag', { x: q.x, y: 0, z: q.z }, { x: -cz, y: 0, z: cx }, { x: cx, y: 0, z: cz }, 7, 2.2, Y, Y + 0.7);
  }
  for (let i = 0; i < 8; i++) {
    const h = i / 8 * Math.PI * 2 + Math.PI / 8, q = { x: m.x + Math.cos(h) * 13, z: m.z + Math.sin(h) * 13 };
    K.props.push({ soort: 'bank', x: q.x, y: K.hoogte(q.x, q.z), z: q.z, rot: -h - Math.PI / 2, schaal: 1, variant: 0 });
  }
  for (const [a, c] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) prop(K, 'lantaarnKlassiek', a, c);
  for (const [a, c] of [[-21, -21], [21, -21], [-21, 21], [21, 21], [0, -22], [-22, 0], [22, 0]]) boom(K, a, c, 'plataan');
}
