import { V2, V3 } from '../math';
import { MeshBouwer, MeshData } from './mesh';
import { cilinder } from './props';
import { driehoeken, verfijn } from '../poly';
import { Dienst, DIENSTEN } from '../voorzieningen';
import { Rng } from '../rng';

// Gebouwen van de nutsvoorzieningen. Assen per voorziening: u langs de weg, v naar de weg toe
// (voorkant). Afmetingen op ware grootte (een windturbine is 120 m hoog).

type H = (x: number, z: number) => number;
const OP: V3 = { x: 0, y: 1, z: 0 };

/** Windrichting voor alle turbines (de rotor kijkt naar het zuidwesten). */
export const WIND = Math.atan2(0.6, -0.8);
export const ASHOOGTE = 120;

function grond(mb: MeshBouwer, mat: string, poly: V2[], hoogte: H, dy = 0.08) {
  const v = verfijn(poly, driehoeken(poly), 8);
  for (let i = 0; i < v.tri.length; i += 3) {
    const [a, b, c] = [v.p[v.tri[i]], v.p[v.tri[i + 1]], v.p[v.tri[i + 2]]];
    mb.driehoek(mat, { x: a.x, y: hoogte(a.x, a.z) + dy, z: a.z }, { x: b.x, y: hoogte(b.x, b.z) + dy, z: b.z }, { x: c.x, y: hoogte(c.x, c.z) + dy, z: c.z }, [a.x, a.z], [b.x, b.z], [c.x, c.z], OP);
  }
}

/** Platte, ronde schijf (waterspiegel). */
function schijf(mb: MeshBouwer, mat: string, c: V2, y: number, r: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    mb.driehoek(mat, { x: c.x, y, z: c.z }, { x: c.x + Math.cos(a0) * r, y, z: c.z + Math.sin(a0) * r }, { x: c.x + Math.cos(a1) * r, y, z: c.z + Math.sin(a1) * r }, [0, 0], [1, 0], [1, 1], OP);
  }
}

export function bouwDienst(d: Dienst, hoogte: H): MeshData {
  const mb = new MeshBouwer();
  const info = DIENSTEN[d.soort];
  const r = new Rng(d.id * 7919);
  const v = { x: Math.sin(d.rot), z: Math.cos(d.rot) }, u = { x: v.z, z: -v.x };
  const P = (a: number, c: number): V2 => ({ x: d.p.x + u.x * a + v.x * c, z: d.p.z + u.z * a + v.z * c });
  let Y = -Infinity;
  for (const q of d.voet) Y = Math.max(Y, hoogte(q.x, q.z));
  Y += 0.1;
  const doos = (zij: string, top: string, a: number, c: number, b: number, dd: number, y0: number, y1: number) => {
    const m = P(a, c);
    mb.blok(zij, top, { x: m.x, y: 0, z: m.z }, { x: u.x, y: 0, z: u.z }, { x: v.x, y: 0, z: v.z }, b, dd, y0, y1, false);
  };
  const B = info.b, D = info.d;
  const hek = (y: number) => {
    const hk = [P(-B / 2 + 1, -D / 2 + 1), P(B / 2 - 1, -D / 2 + 1), P(B / 2 - 1, D / 2 - 1), P(-B / 2 + 1, D / 2 - 1)];
    for (let i = 0; i < 4; i++) {
      const a = hk[i], b = hk[(i + 1) % 4];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      // Poort in de voorkant.
      if (i === 2) {
        const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, t = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
        const g1 = { x: m.x - t.x * 4, z: m.z - t.z * 4 }, g2 = { x: m.x + t.x * 4, z: m.z + t.z * 4 };
        for (const [p, q] of [[a, g1], [g2, b]] as const) {
          const l = Math.hypot(q.x - p.x, q.z - p.z);
          mb.quad('hekwerk', { x: p.x, y: hoogte(p.x, p.z), z: p.z }, { x: q.x, y: hoogte(q.x, q.z), z: q.z }, { x: q.x, y: hoogte(q.x, q.z) + 2.2, z: q.z }, { x: p.x, y: hoogte(p.x, p.z) + 2.2, z: p.z }, [0, 0], [l / 3.5, 0], [l / 3.5, 1], [0, 1], { x: v.x, y: 0, z: v.z });
        }
        continue;
      }
      mb.quad('hekwerk', { x: a.x, y: hoogte(a.x, a.z), z: a.z }, { x: b.x, y: hoogte(b.x, b.z), z: b.z }, { x: b.x, y: hoogte(b.x, b.z) + 2.2, z: b.z }, { x: a.x, y: hoogte(a.x, a.z) + 2.2, z: a.z }, [0, 0], [L / 3.5, 0], [L / 3.5, 1], [0, 1], { x: 0, y: 0, z: 0 });
    }
    void y;
  };

  if (!d.klaar) {
    // Bouwterrein: zand, keet, hek, een kraan naarmate het vordert.
    grond(mb, 'erfverharding', d.voet, hoogte);
    doos('keet', 'trimDonker', -B / 2 + 8, D / 2 - 6, 6, 2.4, Y, Y + 2.6);
    hek(Y);
    const h = 6 + d.voortgang * 30;
    const k = P(0, 0);
    cilinder(mb, 'kraan', { x: k.x, y: Y, z: k.z }, { x: k.x, y: Y + h, z: k.z }, 0.8, 0.8, 4);
    doos('kraan', 'kraan', 8, 0, 24, 1.2, Y + h, Y + h + 1.2);
    return mb.bouw();
  }

  switch (d.soort) {
    case 'windmolen': {
      grond(mb, 'grind', [P(-12, -12), P(12, -12), P(12, 12), P(-12, 12)], hoogte);
      const c = d.p;
      cilinder(mb, 'beton', { x: c.x, y: Y - 1, z: c.z }, { x: c.x, y: Y + 1.2, z: c.z }, 6, 6, 16);
      // Toren: taps toelopend, in segmenten (zachte normalen via de cilinder).
      const ringen = 6;
      for (let i = 0; i < ringen; i++) {
        const y0 = Y + 1.2 + (ASHOOGTE - 3) * i / ringen, y1 = Y + 1.2 + (ASHOOGTE - 3) * (i + 1) / ringen;
        const r0 = 2.3 - 1.0 * i / ringen, r1 = 2.3 - 1.0 * (i + 1) / ringen;
        cilinder(mb, 'turbinewit', { x: c.x, y: y0, z: c.z }, { x: c.x, y: y1, z: c.z }, r0, r1, 18);
      }
      // Gondel naar de wind gericht.
      const w = { x: Math.sin(WIND), z: Math.cos(WIND) }, wu = { x: w.z, z: -w.x };
      const g = { x: c.x - w.x * 3, z: c.z - w.z * 3 };
      mb.blok('turbinewit', 'turbinewit', { x: g.x, y: 0, z: g.z }, { x: w.x, y: 0, z: w.z }, { x: wu.x, y: 0, z: wu.z }, 13, 4.2, Y + ASHOOGTE - 2.2, Y + ASHOOGTE + 2.2, true);
      // Deur in de voet.
      const dr = { x: c.x + v.x * 2.25, z: c.z + v.z * 2.25 };
      mb.quad('trimDonker', { x: dr.x - u.x * 0.5, y: Y + 1.3, z: dr.z - u.z * 0.5 }, { x: dr.x + u.x * 0.5, y: Y + 1.3, z: dr.z + u.z * 0.5 }, { x: dr.x + u.x * 0.5, y: Y + 3.5, z: dr.z + u.z * 0.5 }, { x: dr.x - u.x * 0.5, y: Y + 3.5, z: dr.z - u.z * 0.5 }, [0, 0], [1, 0], [1, 1], [0, 1], { x: v.x, y: 0, z: v.z });
      // Transformatorkastje.
      doos('turbinewit', 'trimDonker', 7, 6, 3, 2.4, Y, Y + 2.6);
      break;
    }
    case 'zonnepark': {
      grond(mb, 'gras', d.voet, hoogte, 0.06);
      // Rijen panelen op het zuiden (+z), 25 graden schuin.
      const zuid = { x: 0, z: 1 }, oost = { x: 1, z: 0 };
      const hk = d.voet;
      const xs = hk.map(q => q.x), zs = hk.map(q => q.z);
      const x0 = Math.min(...xs) + 6, x1 = Math.max(...xs) - 6, z0 = Math.min(...zs) + 6, z1 = Math.max(...zs) - 6;
      const binnen = (p: V2) => { let n = false; for (let i = 0, j = hk.length - 1; i < hk.length; j = i++) { const a = hk[i], b = hk[j]; if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) n = !n; } return n; };
      const diep = 4.2, hoogteVoor = 0.8, hoogteAchter = 0.8 + diep * Math.sin(25 * Math.PI / 180), rijAfstand = 7.5;
      for (let z = z0; z < z1 - diep; z += rijAfstand) {
        for (let x = x0; x < x1 - 2; x += 10) {
          const m = { x: x + 5, z: z + diep / 2 };
          if (!binnen({ x, z }) || !binnen({ x: x + 10, z: z + diep })) continue;
          const y = hoogte(m.x, m.z);
          const A = { x, y: y + hoogteAchter, z }, Bp = { x: x + 9.8, y: y + hoogteAchter, z }, C = { x: x + 9.8, y: y + hoogteVoor, z: z + diep * Math.cos(25 * Math.PI / 180) }, Dp = { x, y: y + hoogteVoor, z: z + diep * Math.cos(25 * Math.PI / 180) };
          mb.quad('zonnepaneel', A, Bp, C, Dp, [0, 0], [10, 0], [10, 4], [0, 4], { x: 0, y: 0.9, z: 0.42 });
          mb.quad('metaal', A, Dp, C, Bp, [0, 0], [1, 0], [1, 1], [0, 1], { x: 0, y: -0.9, z: -0.42 });
          for (const xx of [x + 1, x + 8.8]) {
            cilinder(mb, 'metaal', { x: xx, y, z: z + 0.4 }, { x: xx, y: y + hoogteAchter - 0.1, z: z + 0.4 }, 0.06, 0.06, 4);
            cilinder(mb, 'metaal', { x: xx, y, z: z + diep * 0.85 }, { x: xx, y: y + hoogteVoor, z: z + diep * 0.85 }, 0.06, 0.06, 4);
          }
        }
      }
      void zuid; void oost;
      doos('turbinewit', 'trimDonker', -B / 2 + 10, D / 2 - 6, 6, 2.5, Y, Y + 2.8);
      hek(Y);
      break;
    }
    case 'gascentrale': {
      grond(mb, 'erfverharding', d.voet, hoogte);
      doos('golfplaat:1', 'golfdak', -12, -8, 50, 34, Y, Y + 26);
      doos('golfplaat:3', 'golfdak', 24, -10, 22, 28, Y, Y + 18);
      doos('gevel:modernDonker', 'dakgrind', -20, 22, 24, 12, Y, Y + 10);
      // Twee schoorstenen.
      for (const a of [14, 26]) { const c = P(a, 14); cilinder(mb, 'beton', { x: c.x, y: Y, z: c.z }, { x: c.x, y: Y + 62, z: c.z }, 2.6, 2.0, 16); cilinder(mb, 'trimDonker', { x: c.x, y: Y + 62, z: c.z }, { x: c.x, y: Y + 64, z: c.z }, 2.05, 2.05, 16); }
      // Transformatoren en leidingen.
      for (let i = 0; i < 3; i++) doos('metaal', 'metaal', -38 + i * 7, 24, 4.5, 5, Y, Y + 5);
      for (const c of [0, 3]) { const a = P(-40, -30 + c), b = P(30, -30 + c); cilinder(mb, 'kraan', { x: a.x, y: Y + 2, z: a.z }, { x: b.x, y: Y + 2, z: b.z }, 0.6, 0.6, 8); }
      hek(Y);
      break;
    }
    case 'pompstation': {
      grond(mb, 'gras', d.voet, hoogte, 0.06);
      grond(mb, 'erfverharding', [P(-B / 2 + 2, D / 2 - 14), P(B / 2 - 2, D / 2 - 14), P(B / 2 - 2, D / 2 - 2), P(-B / 2 + 2, D / 2 - 2)], hoogte);
      doos('muur:baksteenRood', 'dakpannenAntraciet', -8, 8, 22, 12, Y, Y + 7);
      // Twee reinwaterkelders (rond, betonnen wand met groen dak).
      for (const a of [-14, 14]) { const c = P(a, -10); cilinder(mb, 'beton', { x: c.x, y: Y - 0.5, z: c.z }, { x: c.x, y: Y + 5, z: c.z }, 9, 9, 24); cilinder(mb, 'gras', { x: c.x, y: Y + 5, z: c.z }, { x: c.x, y: Y + 5.6, z: c.z }, 9, 6, 24); }
      doos('beton', 'beton', 14, 12, 8, 6, Y, Y + 4);
      hek(Y);
      break;
    }
    case 'rwzi': {
      grond(mb, 'erfverharding', d.voet, hoogte);
      // Ronde nabezinktanks met water en een draaiende brug.
      for (const [a, c] of [[-28, -12], [0, -12]] as const) {
        const m = P(a, c);
        cilinder(mb, 'beton', { x: m.x, y: Y - 0.5, z: m.z }, { x: m.x, y: Y + 1.6, z: m.z }, 13, 13, 28);
        schijf(mb, 'zuiveringswater', m, Y + 1.3, 12.6, 28);
        cilinder(mb, 'beton', { x: m.x, y: Y + 1.3, z: m.z }, { x: m.x, y: Y + 1.9, z: m.z }, 1.2, 1.2, 10);
        mb.blok('metaal', 'metaal', { x: m.x, y: 0, z: m.z }, { x: u.x, y: 0, z: u.z }, { x: v.x, y: 0, z: v.z }, 26, 1.2, Y + 1.8, Y + 2.5, true);
      }
      // Beluchtingstanks.
      for (let i = 0; i < 3; i++) {
        const a = 30, c = -24 + i * 13;
        doos('beton', 'zuiveringswater', a, c, 30, 11, Y - 0.5, Y + 1.5);
      }
      doos('muur:baksteenBruin', 'dakgrind', -26, 24, 26, 12, Y, Y + 8);
      doos('golfplaat:2', 'golfdak', 6, 26, 18, 10, Y, Y + 9);
      hek(Y);
      break;
    }
    case 'stortplaats': {
      grond(mb, 'grind', d.voet, hoogte);
      // Afvalberg als afgeknotte piramide met talud.
      const h = 14, b0 = B * 0.38, d0 = D * 0.36, b1 = b0 - 18, d1 = d0 - 16;
      const onder = [P(-b0, -d0 - 5), P(b0, -d0 - 5), P(b0, d0 - 5), P(-b0, d0 - 5)].map(q => ({ x: q.x, y: Y, z: q.z }));
      const boven = [P(-b1, -d1 - 5), P(b1, -d1 - 5), P(b1, d1 - 5), P(-b1, d1 - 5)].map(q => ({ x: q.x, y: Y + h, z: q.z }));
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        const m = { x: (onder[i].x + onder[j].x) / 2 - d.p.x, y: 0.6, z: (onder[i].z + onder[j].z) / 2 - d.p.z };
        mb.quad('zandberg', onder[i], onder[j], boven[j], boven[i], [0, 0], [30, 0], [30, 10], [0, 10], m);
      }
      mb.quad('afval', boven[0], boven[1], boven[2], boven[3], [0, 0], [30, 0], [30, 30], [0, 30], OP);
      // Werkplatform met een compactor en een weegbrug.
      doos('kraan', 'kraan', 8, 0, 5, 3, Y + h, Y + h + 3.2);
      doos('keet', 'trimDonker', -B / 2 + 12, D / 2 - 8, 9, 3, Y, Y + 3);
      doos('beton', 'metaal', -B / 2 + 26, D / 2 - 8, 16, 3.5, Y, Y + 0.3);
      hek(Y);
      void r;
      break;
    }
    case 'afvalcentrale': {
      grond(mb, 'erfverharding', d.voet, hoogte);
      doos('gevel:modernDonker', 'dakgrind', -6, -6, 56, 40, Y, Y + 34);
      doos('golfplaat:0', 'golfdak', 30, 0, 18, 30, Y, Y + 22);
      const c = P(26, -22);
      cilinder(mb, 'turbinewit', { x: c.x, y: Y, z: c.z }, { x: c.x, y: Y + 90, z: c.z }, 2.6, 2.2, 18);
      cilinder(mb, 'trimDonker', { x: c.x, y: Y + 88, z: c.z }, { x: c.x, y: Y + 90.5, z: c.z }, 2.3, 2.3, 18);
      // Aanvoerhal voor de vuilniswagens.
      doos('golfplaat:2', 'golfdak', -6, 22, 30, 8, Y, Y + 9);
      hek(Y);
      break;
    }
  }
  return mb.bouw();
}

/** Rotor van een windturbine (naaf + drie bladen) rond de oorsprong, as langs +x. */
export function windRotor(): MeshData {
  const mb = new MeshBouwer();
  cilinder(mb, 'turbinewit', { x: -1.5, y: 0, z: 0 }, { x: 2.2, y: 0, z: 0 }, 2.0, 0.6, 14);
  const L = 63;
  for (let i = 0; i < 3; i++) {
    const h = (i / 3) * Math.PI * 2;
    const dir = { y: Math.cos(h), z: Math.sin(h) }, dw = { y: -Math.sin(h), z: Math.cos(h) };
    // Blad: breed bij de wortel, smal aan de punt, licht verdraaid.
    const pts: [number, number][] = [[1.5, 1.0], [10, 2.2], [30, 1.6], [50, 1.0], [L, 0.35]];
    for (let k = 0; k < pts.length - 1; k++) {
      const [a, wa] = pts[k], [b, wb] = pts[k + 1];
      const tw = 0.15 * k;
      const P = (s: number, w: number, side: number): V3 => ({ x: 0.3 + side * w * Math.sin(tw) * 0.3, y: dir.y * s + dw.y * w * side, z: dir.z * s + dw.z * w * side });
      mb.quad('turbinewit', P(a, wa, -0.5), P(b, wb, -0.5), P(b, wb, 0.5), P(a, wa, 0.5), [0, 0], [1, 0], [1, 1], [0, 1], { x: 1, y: 0, z: 0 });
      mb.quad('turbinewit', P(a, wa, -0.5), P(a, wa, 0.5), P(b, wb, 0.5), P(b, wb, -0.5), [0, 0], [1, 0], [1, 1], [0, 1], { x: -1, y: 0, z: 0 });
    }
  }
  return mb.bouw();
}
