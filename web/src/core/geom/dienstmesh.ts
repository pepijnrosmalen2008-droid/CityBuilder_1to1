import { V2, V3 } from '../math';
import { MeshBouwer, MeshData, Prop } from './mesh';
import { cilinder } from './props';
import { driehoeken, verfijn } from '../poly';
import { Dienst, DIENSTEN } from '../voorzieningen';
import { Rng } from '../rng';
import { gebouwBlok, dakkasten, luifel, parkeervakken, leidingbrug, vlaggenmast, fietsenrek, tank, container } from './detail';

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

export function bouwDienst(d: Dienst, hoogte: H): { mesh: MeshData; props: Prop[] } {
  const mb = new MeshBouwer();
  const props: Prop[] = [];
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
  /** Gebouw met gevels (a langs de weg, c naar de weg; kant 2 = voorkant). */
  const G = (gevel: string, a: number, c: number, b: number, dd: number, y0: number, y1: number, opt: Parameters<typeof gebouwBlok>[8] = {}) => gebouwBlok(mb, P(a, c), u, b, dd, y0, y1, gevel, opt);
  const kasten = (a: number, c: number, b: number, dd: number, y: number, n = 4) => dakkasten(mb, P(a, c), u, b, dd, y, r, n);
  const raamband = (a: number, c: number, b: number, y0: number, y1: number, mat = 'raam') => { const p0 = P(a - b / 2, c), p1 = P(a + b / 2, c); mb.quad(mat, { x: p0.x, y: y0, z: p0.z }, { x: p1.x, y: y0, z: p1.z }, { x: p1.x, y: y1, z: p1.z }, { x: p0.x, y: y1, z: p0.z }, [0, 0], [1, 0], [1, 1], [0, 1], { x: v.x, y: 0, z: v.z }); };
  const boom = (a: number, c: number) => { const q = P(a, c); props.push({ soort: r.kies(['linde', 'eik', 'plataan'] as const), x: q.x, y: hoogte(q.x, q.z), z: q.z, rot: r.range(0, 6.3), schaal: r.range(0.7, 0.95), variant: r.int(0, 1) }); };
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
    return { mesh: mb.bouw(), props };
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
      // Turbinehal en ketelhuis met lichtstraten, een kantoor met ramen, schoorstenen met bordessen.
      G('golfplaat:1', -12, -8, 50, 34, Y, Y + 26, { dak: 'golfdak', rand: 'metaal' });
      G('golfplaat:3', 24, -10, 22, 28, Y, Y + 18, { dak: 'golfdak', rand: 'metaal' });
      for (let i = 0; i < 4; i++) doos('lichtstraat', 'lichtstraat', -30 + i * 12, -8, 6, 26, Y + 26, Y + 27);
      for (const y of [8, 16]) raamband(-12, 9.02, 46, Y + y, Y + y + 1.2, 'lichtstraat');
      G('gevel:modernDonker', -20, 22, 24, 12, Y, Y + 10);
      luifel(mb, P(-20, 28), u, 8, 3, Y);
      kasten(-12, -8, 50, 34, Y + 26, 6);
      for (const a of [14, 26]) {
        const c = P(a, 14);
        cilinder(mb, 'beton', { x: c.x, y: Y, z: c.z }, { x: c.x, y: Y + 62, z: c.z }, 2.6, 2.0, 18);
        for (const y of [30, 55]) cilinder(mb, 'metaal', { x: c.x, y: Y + y, z: c.z }, { x: c.x, y: Y + y + 0.3, z: c.z }, 3.4, 3.4, 18);
        cilinder(mb, 'remklauw', { x: c.x, y: Y + 58, z: c.z }, { x: c.x, y: Y + 60, z: c.z }, 2.12, 2.1, 18);
        cilinder(mb, 'trimDonker', { x: c.x, y: Y + 62, z: c.z }, { x: c.x, y: Y + 64, z: c.z }, 2.05, 2.05, 18);
      }
      // Transformatorpark met hoogspanningsportalen.
      for (let i = 0; i < 3; i++) {
        doos('metaal', 'metaal', -38 + i * 7, 24, 4.5, 5, Y, Y + 5);
        for (const k of [-1.2, 0, 1.2]) { const q = P(-38 + i * 7 + k, 24); cilinder(mb, 'beton', { x: q.x, y: Y + 5, z: q.z }, { x: q.x, y: Y + 6.6, z: q.z }, 0.25, 0.15, 8); }
      }
      for (const a of [-42, -24]) for (const c of [30, 36]) { const q = P(a, c); cilinder(mb, 'kraan', { x: q.x, y: Y, z: q.z }, { x: q.x, y: Y + 14, z: q.z }, 0.3, 0.25, 6); }
      doos('kraan', 'kraan', -33, 30, 20, 0.5, Y + 13.5, Y + 14.2);
      doos('kraan', 'kraan', -33, 36, 20, 0.5, Y + 13.5, Y + 14.2);
      leidingbrug(mb, P(-40, -28), P(30, -28), Y, 3);
      tank(mb, P(36, -30), Y, 5, 9);
      hek(Y);
      break;
    }
    case 'pompstation': {
      grond(mb, 'gras', d.voet, hoogte, 0.06);
      grond(mb, 'erfverharding', [P(-B / 2 + 2, D / 2 - 14), P(B / 2 - 2, D / 2 - 14), P(B / 2 - 2, D / 2 - 2), P(-B / 2 + 2, D / 2 - 2)], hoogte);
      // Historisch pompgebouw: baksteen met hoge ramen en een schilddak, en een moderne zuiveringshal.
      G('gevel:baksteenRood', -8, 8, 22, 12, Y, Y + 7, { dak: 'dakgrind', rand: 'trim' });
      const k = P(-8, 8);
      mb.blok('dakpannenAntraciet', 'dakpannenAntraciet', { x: k.x, y: 0, z: k.z }, { x: u.x, y: 0, z: u.z }, { x: v.x, y: 0, z: v.z }, 20, 10, Y + 7.6, Y + 8.4);
      G('golfplaat:1', 14, 12, 12, 8, Y, Y + 6, { dak: 'golfdak' });
      for (const a of [-14, 14]) {
        const c = P(a, -10);
        cilinder(mb, 'beton', { x: c.x, y: Y - 0.5, z: c.z }, { x: c.x, y: Y + 5, z: c.z }, 9, 9, 28);
        cilinder(mb, 'gras', { x: c.x, y: Y + 5, z: c.z }, { x: c.x, y: Y + 5.6, z: c.z }, 9, 6, 28);
        // Ontluchtingskoepeltje en trap.
        cilinder(mb, 'metaal', { x: c.x, y: Y + 5.6, z: c.z }, { x: c.x, y: Y + 6.8, z: c.z }, 0.6, 0.3, 10);
        doos('metaal', 'metaal', a + 9.3, -10, 0.8, 1.2, Y, Y + 5);
      }
      leidingbrug(mb, P(-14, -1), P(14, -1), Y, 1.2, 2);
      // Infiltratieput en pompputten met deksels.
      for (let i = 0; i < 4; i++) { const q = P(-20 + i * 6, -24); cilinder(mb, 'beton', { x: q.x, y: Y - 0.2, z: q.z }, { x: q.x, y: Y + 0.8, z: q.z }, 1.2, 1.2, 12); cilinder(mb, 'metaal', { x: q.x, y: Y + 0.8, z: q.z }, { x: q.x, y: Y + 1.4, z: q.z }, 0.5, 0.5, 8); }
      boom(-22, 18); boom(20, 22); boom(-24, -2);
      hek(Y);
      break;
    }
    case 'rwzi': {
      grond(mb, 'erfverharding', d.voet, hoogte);
      // Ronde nabezinktanks met water, een draaiende brug met leuning en een overloopgoot.
      for (const [a, c] of [[-28, -12], [0, -12]] as const) {
        const m = P(a, c);
        cilinder(mb, 'beton', { x: m.x, y: Y - 0.5, z: m.z }, { x: m.x, y: Y + 1.6, z: m.z }, 13, 13, 32);
        schijf(mb, 'zuiveringswater', m, Y + 1.3, 12.6, 32);
        cilinder(mb, 'beton', { x: m.x, y: Y + 1.25, z: m.z }, { x: m.x, y: Y + 1.4, z: m.z }, 12.6, 11.6, 32);
        cilinder(mb, 'beton', { x: m.x, y: Y + 1.3, z: m.z }, { x: m.x, y: Y + 1.9, z: m.z }, 1.2, 1.2, 12);
        mb.blok('metaal', 'metaal', { x: m.x, y: 0, z: m.z }, { x: u.x, y: 0, z: u.z }, { x: v.x, y: 0, z: v.z }, 26, 1.2, Y + 1.8, Y + 2.1, true);
        for (const k of [-0.55, 0.55]) mb.blok('metaal', 'metaal', { x: m.x + v.x * k, y: 0, z: m.z + v.z * k }, { x: u.x, y: 0, z: u.z }, { x: v.x, y: 0, z: v.z }, 26, 0.05, Y + 2.9, Y + 3.0, true);
        doos('trimDonker', 'trimDonker', a + 12.6, c, 0.8, 1.8, Y + 1.6, Y + 3.0);
      }
      // Beluchtingstanks met loopbruggen en leuningen.
      for (let i = 0; i < 3; i++) {
        const a = 30, c = -24 + i * 13;
        doos('beton', 'zuiveringswater', a, c, 30, 11, Y - 0.5, Y + 1.5);
        doos('metaal', 'metaal', a, c + 5.8, 30, 1.2, Y + 1.5, Y + 1.65);
        doos('metaal', 'metaal', a, c + 6.35, 30, 0.05, Y + 2.5, Y + 2.6);
      }
      // Slibgistingstanks (de typische 'eieren') en een gashouder.
      for (const a of [-40, -32]) {
        const m = P(a, 18);
        cilinder(mb, 'turbinewit', { x: m.x, y: Y, z: m.z }, { x: m.x, y: Y + 8, z: m.z }, 2.5, 4.2, 18);
        cilinder(mb, 'turbinewit', { x: m.x, y: Y + 8, z: m.z }, { x: m.x, y: Y + 15, z: m.z }, 4.2, 4.2, 18);
        cilinder(mb, 'turbinewit', { x: m.x, y: Y + 15, z: m.z }, { x: m.x, y: Y + 20, z: m.z }, 4.2, 1.2, 18);
        cilinder(mb, 'metaal', { x: m.x, y: Y + 20, z: m.z }, { x: m.x, y: Y + 21, z: m.z }, 1.3, 1.3, 12);
      }
      leidingbrug(mb, P(-36, 12), P(14, 12), Y, 3, 2);
      G('gevel:baksteenBruin', -10, 24, 22, 12, Y, Y + 8);
      G('golfplaat:2', 14, 26, 18, 10, Y, Y + 9, { dak: 'golfdak' });
      kasten(-10, 24, 22, 12, Y + 8, 3);
      hek(Y);
      break;
    }
    case 'stortplaats': {
      grond(mb, 'grind', d.voet, hoogte);
      // Afvalberg als afgeknotte piramide met talud; de bovenkant deels afgedekt met folie.
      const h = 14, b0 = B * 0.38, d0 = D * 0.36, b1 = b0 - 18, d1 = d0 - 16;
      const onder = [P(-b0, -d0 - 5), P(b0, -d0 - 5), P(b0, d0 - 5), P(-b0, d0 - 5)].map(q => ({ x: q.x, y: Y, z: q.z }));
      const boven = [P(-b1, -d1 - 5), P(b1, -d1 - 5), P(b1, d1 - 5), P(-b1, d1 - 5)].map(q => ({ x: q.x, y: Y + h, z: q.z }));
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        const m = { x: (onder[i].x + onder[j].x) / 2 - d.p.x, y: 0.6, z: (onder[i].z + onder[j].z) / 2 - d.p.z };
        mb.quad(i === 2 ? 'gras' : 'zandberg', onder[i], onder[j], boven[j], boven[i], [0, 0], [30, 0], [30, 10], [0, 10], m);
      }
      mb.quad('afval', boven[0], boven[1], boven[2], boven[3], [0, 0], [30, 0], [30, 30], [0, 30], OP);
      // Toegangsweg omhoog over het talud.
      const w0 = P(b0 - 4, d0 - 5), w1 = P(b1 - 4, d1 - 5);
      mb.quad('erfverharding', { x: w0.x - u.x * 2.5, y: Y + 0.15, z: w0.z - u.z * 2.5 }, { x: w0.x + u.x * 2.5, y: Y + 0.15, z: w0.z + u.z * 2.5 }, { x: w1.x + u.x * 2.5, y: Y + h + 0.1, z: w1.z + u.z * 2.5 }, { x: w1.x - u.x * 2.5, y: Y + h + 0.1, z: w1.z - u.z * 2.5 }, [0, 0], [5, 0], [5, 20], [0, 20], OP);
      // Compactor (rupsvoertuig) en een kiepende vrachtwagen bovenop, gasbronnen in rijen.
      doos('kraan', 'kraan', 8, 0, 5, 3, Y + h, Y + h + 2.2);
      doos('autoglas', 'kraan', 7, 0, 2, 2.2, Y + h + 2.2, Y + h + 3.6);
      doos('rubber', 'rubber', 8, 1.7, 5.6, 0.7, Y + h, Y + h + 1.1);
      doos('rubber', 'rubber', 8, -1.7, 5.6, 0.7, Y + h, Y + h + 1.1);
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { const q = P(-b1 + 6 + i * (2 * b1 - 12) / 4, -d1 - 5 + 5 + j * (2 * d1 - 10) / 2); cilinder(mb, 'metaal', { x: q.x, y: Y + h, z: q.z }, { x: q.x, y: Y + h + 1.2, z: q.z }, 0.15, 0.15, 6); }
      doos('keet', 'trimDonker', -B / 2 + 12, D / 2 - 8, 9, 3, Y, Y + 3);
      doos('keet', 'trimDonker', -B / 2 + 12, D / 2 - 11.2, 9, 3, Y, Y + 3);
      doos('beton', 'metaal', -B / 2 + 26, D / 2 - 8, 16, 3.5, Y, Y + 0.3);
      for (let i = 0; i < 5; i++) container(mb, P(B / 2 - 14, D / 2 - 6 - i * 3.2), u, Y, i);
      hek(Y);
      break;
    }
    case 'afvalcentrale': {
      grond(mb, 'erfverharding', d.voet, hoogte);
      // Ketelhuis met een raamstrook en glazen trappenhuis, bunkerhal, rookgasreiniging, schoorsteen.
      G('gevel:modernDonker', -6, -6, 56, 40, Y, Y + 34, { dichtKanten: [0, 1, 3] });
      for (const y of [12, 24]) raamband(-6, 14.02, 52, Y + y, Y + y + 1.5, 'lichtstraat');
      doos('glas', 'trimDonker', -30, 10, 6, 6, Y, Y + 36);
      G('golfplaat:0', 30, 0, 18, 30, Y, Y + 22, { dak: 'golfdak', rand: 'metaal' });
      for (let i = 0; i < 2; i++) tank(mb, P(30 + (i - 0.5) * 9, -22), Y, 3.5, 16, 'turbinewit');
      const c = P(26, -22);
      cilinder(mb, 'turbinewit', { x: c.x, y: Y, z: c.z }, { x: c.x, y: Y + 90, z: c.z }, 2.6, 2.2, 20);
      for (const y of [40, 70]) cilinder(mb, 'metaal', { x: c.x, y: Y + y, z: c.z }, { x: c.x, y: Y + y + 0.3, z: c.z }, 3.4, 3.4, 18);
      for (const y of [80, 84]) cilinder(mb, 'remklauw', { x: c.x, y: Y + y, z: c.z }, { x: c.x, y: Y + y + 2, z: c.z }, 2.28, 2.28, 18);
      cilinder(mb, 'trimDonker', { x: c.x, y: Y + 88, z: c.z }, { x: c.x, y: Y + 90.5, z: c.z }, 2.3, 2.3, 18);
      kasten(-6, -6, 56, 40, Y + 34, 6);
      // Aanvoerhal met overheaddeuren en een weegbrug.
      G('golfplaat:2', -6, 22, 30, 8, Y, Y + 9, { dak: 'golfdak' });
      for (let i = 0; i < 3; i++) { const q0 = P(-16 + i * 10 - 2.5, 26.02), q1 = P(-16 + i * 10 + 2.5, 26.02); mb.quad('roldeur', { x: q0.x, y: Y, z: q0.z }, { x: q1.x, y: Y, z: q1.z }, { x: q1.x, y: Y + 6, z: q1.z }, { x: q0.x, y: Y + 6, z: q0.z }, [0, 0], [5, 0], [5, 6], [0, 6], { x: v.x, y: 0, z: v.z }); }
      doos('beton', 'metaal', -36, 30, 14, 3.5, Y, Y + 0.3);
      doos('glas', 'trimDonker', -44, 30, 3, 3, Y, Y + 2.8);
      hek(Y);
      break;
    }
    case 'brandweer': {
      grond(mb, 'erfverharding', d.voet, hoogte);
      // Kazerne: uitrukhal met drie deuren aan de straat, verdieping met ramen erboven, slangentoren.
      G('gevel:baksteenRood', -4, -2, 36, 20, Y, Y + 5.2, { dichtKanten: [0, 1, 2, 3], randH: 0.01 });
      G('gevel:baksteenRood', -4, -2, 36, 20, Y + 5.2, Y + 9, { rand: 'trim', randH: 0.5 });
      G('gevel:baksteenRood', 18, -6, 5, 5, Y, Y + 18, { rand: 'trim' });
      doos('remklauw', 'remklauw', -4, 8.05, 36.2, 0.12, Y + 4.9, Y + 5.5);
      for (let i = 0; i < 3; i++) {
        const a = -16 + i * 8.5, c = 8.03;
        const p0 = P(a - 2.2, c), p1 = P(a + 2.2, c);
        mb.quad('remklauw', { x: p0.x, y: Y, z: p0.z }, { x: p1.x, y: Y, z: p1.z }, { x: p1.x, y: Y + 4.6, z: p1.z }, { x: p0.x, y: Y + 4.6, z: p0.z }, [0, 0], [1, 0], [1, 1], [0, 1], { x: v.x, y: 0, z: v.z });
        // Glazen ruitjes in de deur en lamellen.
        raamband(a, 8.05, 3.6, Y + 2.6, Y + 3.4, 'raam');
        for (let y = 0.4; y < 4.4; y += 0.55) raamband(a, 8.06, 4.4, Y + y, Y + y + 0.05, 'trimDonker');
        for (const da of [-2.4, 2.3]) {
          const q0 = P(a + da, c + 1), q1 = P(a + da + 0.12, c + 1), q2 = P(a + da + 0.12, c + 11), q3 = P(a + da, c + 11);
          mb.quad('kraan', { x: q0.x, y: hoogte(q0.x, q0.z) + 0.13, z: q0.z }, { x: q1.x, y: hoogte(q1.x, q1.z) + 0.13, z: q1.z }, { x: q2.x, y: hoogte(q2.x, q2.z) + 0.13, z: q2.z }, { x: q3.x, y: hoogte(q3.x, q3.z) + 0.13, z: q3.z }, [0, 0], [1, 0], [1, 1], [0, 1], OP);
        }
      }
      // Oefentoren met balkons, sirene op een mast, vlaggen, oefenterrein met een rookcontainer.
      for (const y of [7, 11, 15]) doos('metaal', 'metaal', 18, -2.9, 4, 1.2, Y + y - 0.1, Y + y);
      const mast = P(-20, -10);
      cilinder(mb, 'metaal', { x: mast.x, y: Y + 9, z: mast.z }, { x: mast.x, y: Y + 13, z: mast.z }, 0.1, 0.08, 6);
      doos('turbinewit', 'turbinewit', -20, -10, 1.2, 1.2, Y + 13, Y + 13.6);
      for (const a of [6, 9, 12]) vlaggenmast(mb, P(a, 12), u, Y, a === 9 ? 'remklauw' : 'politieblauw');
      container(mb, P(-18, -16), u, Y, 2);
      kasten(-4, -2, 36, 20, Y + 9, 3);
      parkeervakken(mb, P(10, -16), u, 6, hoogte);
      boom(-24, 10);
      break;
    }
    case 'politie': {
      grond(mb, 'stoeptegels', d.voet, hoogte);
      // Bureau met blauwe band, entree met luifel en het politielogo, antennemast, afgesloten parkeerplaats.
      G('gevel:modernDonker', -4, -4, 30, 18, Y, Y + 12, { rand: 'politieblauw', randH: 1.2 });
      doos('politieblauw', 'politieblauw', -4, 5.06, 30.2, 0.1, Y + 4, Y + 4.6);
      doos('glas', 'trimDonker', -4, 5.5, 8, 1.2, Y, Y + 3.6);
      luifel(mb, P(-4, 5), u, 10, 3.5, Y, 3.8, 'politieblauw');
      doos('politieblauw', 'politieblauw', 4, 5.1, 3, 0.15, Y + 6.5, Y + 8.6);
      doos('trim', 'trim', 4, 5.2, 2.2, 0.1, Y + 6.8, Y + 8.3);
      const ant = P(6, -8);
      cilinder(mb, 'metaal', { x: ant.x, y: Y + 12, z: ant.z }, { x: ant.x, y: Y + 26, z: ant.z }, 0.25, 0.1, 6);
      for (const y of [18, 22]) doos('metaal', 'metaal', 6, -8, 1.6, 0.1, Y + y, Y + y + 0.8);
      vlaggenmast(mb, P(10, 12), u, Y, 'politieblauw');
      kasten(-4, -4, 30, 18, Y + 12, 3);
      parkeervakken(mb, P(-4, -16), u, 8, hoogte);
      fietsenrek(mb, P(-14, 8), u, Y, 8);
      boom(14, 10); boom(-18, 10);
      break;
    }
    case 'ziekenhuis': {
      grond(mb, 'stoeptegels', d.voet, hoogte);
      // Beddenhuis, poliklinieken in glas, laagbouw; rode kruisen, helikopterplatform, techniek op het dak.
      G('gevel:betonband', -10, -12, 74, 34, Y, Y + 26);
      G('gevel:vliesgevel', 32, -4, 30, 40, Y, Y + 16);
      G('gevel:stuc', -30, 22, 30, 16, Y, Y + 10);
      const h = P(-10, -12);
      cilinder(mb, 'beton', { x: h.x, y: Y + 26, z: h.z }, { x: h.x, y: Y + 26.6, z: h.z }, 10, 10, 24);
      for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, q = { x: h.x + Math.cos(a) * 9.5, z: h.z + Math.sin(a) * 9.5 }; cilinder(mb, 'verkeerslichtGroen', { x: q.x, y: Y + 26.6, z: q.z }, { x: q.x, y: Y + 26.75, z: q.z }, 0.15, 0.15, 6); }
      doos('markering', 'markering', -12.5, -12, 0.8, 7, Y + 26.62, Y + 26.64);
      doos('markering', 'markering', -7.5, -12, 0.8, 7, Y + 26.62, Y + 26.64);
      doos('markering', 'markering', -10, -12, 5, 0.8, Y + 26.62, Y + 26.64);
      kasten(20, -12, 30, 30, Y + 26, 5);
      kasten(32, -4, 30, 40, Y + 16, 4);
      // Rode kruisen op de gevels.
      for (const a of [-40, 20]) { doos('remklauw', 'remklauw', a, 5.1, 3.6, 0.15, Y + 20.6, Y + 21.6); doos('remklauw', 'remklauw', a, 5.1, 1.0, 0.15, Y + 19.5, Y + 22.7); }
      // Hoofdingang met luifel, ambulance-ingang met rode luifel, parkeerplaats, bomen.
      luifel(mb, P(0, 5), u, 16, 6, Y, 4.2);
      doos('glas', 'trimDonker', 0, 5.2, 10, 1.5, Y, Y + 4);
      luifel(mb, P(32, 16), u, 12, 6, Y, 4.5, 'remklauw');
      parkeervakken(mb, P(-30, 36), u, 12, hoogte);
      fietsenrek(mb, P(-12, 9), u, Y, 10);
      for (const a of [-44, -20, 12, 44]) boom(a, 34);
      break;
    }
    case 'gezondheidscentrum': {
      grond(mb, 'stoeptegels', d.voet, hoogte);
      G('gevel:baksteenGeel', -2, -2, 26, 16, Y, Y + 7.5, { rand: 'trim' });
      doos('glas', 'trimDonker', -6, 6.2, 6, 1.2, Y, Y + 3.2);
      luifel(mb, P(-6, 6), u, 8, 2.5, Y, 3.4);
      // Groen apotheekkruis aan de gevel, fietsenrek, bankjes en bomen.
      doos('verkeerslichtGroen', 'verkeerslichtGroen', 6, 6.4, 1.6, 0.2, Y + 4.4, Y + 5.0);
      doos('verkeerslichtGroen', 'verkeerslichtGroen', 6, 6.4, 0.6, 0.2, Y + 3.9, Y + 5.5);
      fietsenrek(mb, P(4, 9), u, Y, 6);
      for (const a of [-12, 12]) doos('hout', 'hout', a, 9, 2, 0.5, Y + 0.4, Y + 0.5);
      kasten(-2, -2, 26, 16, Y + 7.5, 2);
      boom(-12, 11); boom(12, 11);
      break;
    }
  }
  return { mesh: mb.bouw(), props };
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
