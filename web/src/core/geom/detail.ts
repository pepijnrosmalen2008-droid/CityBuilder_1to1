import { V2, V3 } from '../math';
import { Rng } from '../rng';
import { MeshBouwer } from './mesh';
import { cilinder } from './props';

// ════════════════════════════════════════════════════════════════════════════════════
// DETAILONDERDELEN voor voorzieningen en bedrijven: gebouwen met echte gevels (ramen),
// dakranden en dakinstallaties, luifels, parkeervakken, leidingbruggen, trekkers, hooibalen.
// Alles in een lokaal assenstelsel: c = midden, t = richting langs (eenheidsvector).
// ════════════════════════════════════════════════════════════════════════════════════

type H = (x: number, z: number) => number;
const OP: V3 = { x: 0, y: 1, z: 0 };
const nrm = (t: V2): V2 => ({ x: -t.z, z: t.x });
const at = (c: V2, t: V2, a: number, b: number): V2 => { const n = nrm(t); return { x: c.x + t.x * a + n.x * b, z: c.z + t.z * a + n.z * b }; };

/**
 * Gebouw met gevels: vier wanden met gevelmateriaal (ramen per 3 m, verdiepingen per 3 m), plat dak
 * met opstaande rand. gevel kan 'gevel:x' (met ramen) of iets anders zijn; dichte kant: 'muur:x'.
 */
export function gebouwBlok(mb: MeshBouwer, c: V2, t: V2, b: number, d: number, y0: number, y1: number, gevel: string, opt: { dicht?: string; dichtKanten?: number[]; dak?: string; rand?: string; randH?: number } = {}) {
  const n = nrm(t);
  const hoek = [at(c, t, -b / 2, -d / 2), at(c, t, b / 2, -d / 2), at(c, t, b / 2, d / 2), at(c, t, -b / 2, d / 2)];
  const uit = [{ x: -n.x, z: -n.z }, t, n, { x: -t.x, z: -t.z }];
  for (let i = 0; i < 4; i++) {
    const a = hoek[i], e = hoek[(i + 1) % 4], L = Math.hypot(e.x - a.x, e.z - a.z);
    const mat = opt.dichtKanten?.includes(i) ? opt.dicht ?? gevel.replace('gevel:', 'muur:') : gevel;
    const uv: [number, number][] = mat.startsWith('gevel:')
      ? [[0, y0 / 6], [Math.round(L / 3) / 2, y0 / 6], [Math.round(L / 3) / 2, y1 / 6], [0, y1 / 6]].map(([u, v]) => [u, v - y0 / 6] as [number, number])
      : [[0, y0], [L, y0], [L, y1], [0, y1]];
    mb.quad(mat, { x: a.x, y: y0, z: a.z }, { x: e.x, y: y0, z: e.z }, { x: e.x, y: y1, z: e.z }, { x: a.x, y: y1, z: a.z }, uv[0], uv[1], uv[2], uv[3], { x: uit[i].x, y: 0, z: uit[i].z });
  }
  mb.quad(opt.dak ?? 'dakgrind', ...hoek.map(p => ({ x: p.x, y: y1, z: p.z })) as [V3, V3, V3, V3], [0, 0], [b, 0], [b, d], [0, d], OP);
  // Dakrand (vier latten).
  const rh = opt.randH ?? 0.6, rm = opt.rand ?? 'trimDonker';
  for (const [a, bb, l, w] of [[0, -d / 2 + 0.15, b, 0.3], [0, d / 2 - 0.15, b, 0.3], [-b / 2 + 0.15, 0, 0.3, d], [b / 2 - 0.15, 0, 0.3, d]] as const) {
    const m = at(c, t, a, bb);
    mb.blok(rm, rm, { x: m.x, y: 0, z: m.z }, { x: t.x, y: 0, z: t.z }, { x: n.x, y: 0, z: n.z }, l, w, y1 - 0.05, y1 + rh);
  }
}

/** Luchtbehandelingskasten, ventilatoren en afvoeren op een plat dak. */
export function dakkasten(mb: MeshBouwer, c: V2, t: V2, b: number, d: number, y: number, r: Rng, n = 4) {
  const nn = nrm(t);
  for (let i = 0; i < n; i++) {
    const a = r.range(-b / 2 + 3, b / 2 - 3), e = r.range(-d / 2 + 2.5, d / 2 - 2.5);
    const m = at(c, t, a, e), lb = r.range(2, 4), ld = r.range(1.4, 2.4), h = r.range(1, 1.8);
    mb.blok('metaal', 'metaal', { x: m.x, y: 0, z: m.z }, { x: t.x, y: 0, z: t.z }, { x: nn.x, y: 0, z: nn.z }, lb, ld, y, y + h);
    cilinder(mb, 'trimDonker', { x: m.x, y: y + h, z: m.z }, { x: m.x, y: y + h + 0.25, z: m.z }, Math.min(lb, ld) * 0.3, Math.min(lb, ld) * 0.3, 10);
  }
  for (let i = 0; i < 3; i++) { const m = at(c, t, r.range(-b / 2 + 2, b / 2 - 2), r.range(-d / 2 + 2, d / 2 - 2)); cilinder(mb, 'metaal', { x: m.x, y, z: m.z }, { x: m.x, y: y + 1.3, z: m.z }, 0.15, 0.15, 6); }
}

/** Luifel op twee kolommen voor een ingang. */
export function luifel(mb: MeshBouwer, c: V2, t: V2, b: number, uit: number, y: number, h = 3.4, mat = 'trimDonker') {
  const n = nrm(t);
  const m = at(c, t, 0, uit / 2);
  mb.blok(mat, mat, { x: m.x, y: 0, z: m.z }, { x: t.x, y: 0, z: t.z }, { x: n.x, y: 0, z: n.z }, b, uit, y + h, y + h + 0.3, true);
  for (const s of [-1, 1]) { const k = at(c, t, s * (b / 2 - 0.4), uit - 0.4); cilinder(mb, 'metaal', { x: k.x, y, z: k.z }, { x: k.x, y: y + h, z: k.z }, 0.12, 0.12, 8); }
}

/** Parkeervakken: witte lijnen op de grond, `aantal` vakken van 2,5 m langs t. */
export function parkeervakken(mb: MeshBouwer, c: V2, t: V2, aantal: number, hoogte: H, diep = 5) {
  const n = nrm(t);
  for (let i = 0; i <= aantal; i++) {
    const a = (i - aantal / 2) * 2.5;
    const p0 = at(c, t, a - 0.06, -diep / 2), p1 = at(c, t, a + 0.06, -diep / 2), p2 = at(c, t, a + 0.06, diep / 2), p3 = at(c, t, a - 0.06, diep / 2);
    mb.quad('markering', ...[p0, p1, p2, p3].map(p => ({ x: p.x, y: hoogte(p.x, p.z) + 0.14, z: p.z })) as [V3, V3, V3, V3], [0, 0], [1, 0], [1, 1], [0, 1], OP);
  }
  void n;
}

/** Leidingbrug: palen met twee of drie buizen tussen a en b, op hoogte h. */
export function leidingbrug(mb: MeshBouwer, a: V2, b: V2, y: number, h: number, buizen = 3) {
  const L = Math.hypot(b.x - a.x, b.z - a.z), t = { x: (b.x - a.x) / L, z: (b.z - a.z) / L }, n = nrm(t);
  for (let s = 0; s <= L; s += 8) {
    const p = { x: a.x + t.x * s, z: a.z + t.z * s };
    for (const k of [-0.8, 0.8]) cilinder(mb, 'kraan', { x: p.x + n.x * k, y, z: p.z + n.z * k }, { x: p.x + n.x * k, y: y + h, z: p.z + n.z * k }, 0.12, 0.12, 6);
    mb.blok('kraan', 'kraan', { x: p.x, y: 0, z: p.z }, { x: n.x, y: 0, z: n.z }, { x: t.x, y: 0, z: t.z }, 2, 0.25, y + h, y + h + 0.25);
  }
  for (let i = 0; i < buizen; i++) {
    const k = (i - (buizen - 1) / 2) * 0.55;
    cilinder(mb, i === 1 ? 'turbinewit' : 'metaal', { x: a.x + n.x * k, y: y + h + 0.5, z: a.z + n.z * k }, { x: b.x + n.x * k, y: y + h + 0.5, z: b.z + n.z * k }, 0.22, 0.22, 8);
  }
}

/** Trekker: motorkap, cabine met ramen, grote achterwielen, kleine voorwielen. c = midden, t = vooruit. */
export function trekker(mb: MeshBouwer, c: V2, t: V2, y: number, kleur = 'politieoranje') {
  const n = nrm(t);
  const B = (a: number, b: number, l: number, w: number, y0: number, y1: number, mat: string) => { const m = at(c, t, a, b); mb.blok(mat, mat, { x: m.x, y: 0, z: m.z }, { x: t.x, y: 0, z: t.z }, { x: n.x, y: 0, z: n.z }, l, w, y + y0, y + y1, true); };
  B(0.9, 0, 2.0, 1.0, 0.7, 1.6, kleur);
  B(-0.6, 0, 1.4, 1.5, 0.7, 1.4, kleur);
  B(-0.6, 0, 1.3, 1.35, 1.4, 2.7, 'autoglas');
  B(-0.6, 0, 1.45, 1.5, 2.7, 2.85, kleur);
  cilinder(mb, 'metaal', { x: at(c, t, 1.4, 0.3).x, y: y + 1.6, z: at(c, t, 1.4, 0.3).z }, { x: at(c, t, 1.4, 0.3).x, y: y + 2.6, z: at(c, t, 1.4, 0.3).z }, 0.06, 0.06, 6);
  for (const [a, r, w] of [[-0.7, 0.85, 0.5], [1.4, 0.48, 0.32]] as const) for (const s of [-1, 1]) {
    const m = at(c, t, a, s * (0.85 + w / 2));
    const e = { x: m.x + n.x * s * w, z: m.z + n.z * s * w };
    cilinder(mb, 'rubber', { x: m.x - n.x * s * w / 2, y: y + r, z: m.z - n.z * s * w / 2 }, { x: e.x - n.x * s * w / 2, y: y + r, z: e.z - n.z * s * w / 2 }, r, r, 14);
    const v = { x: m.x + n.x * s * w * 0.52, z: m.z + n.z * s * w * 0.52 };
    cilinder(mb, 'politieoranje', { x: v.x, y: y + r, z: v.z }, { x: v.x + n.x * s * 0.02, y: y + r, z: v.z + n.z * s * 0.02 }, r * 0.6, r * 0.6, 12);
  }
}

/** Ronde hooibaal (in plastic) liggend op de grond. */
export function hooibaal(mb: MeshBouwer, p: V2, t: V2, y: number, wit = true) {
  const n = nrm(t);
  cilinder(mb, wit ? 'turbinewit' : 'zandberg', { x: p.x - n.x * 0.6, y: y + 0.65, z: p.z - n.z * 0.6 }, { x: p.x + n.x * 0.6, y: y + 0.65, z: p.z + n.z * 0.6 }, 0.65, 0.65, 12);
}

/** Paal met vlag. */
export function vlaggenmast(mb: MeshBouwer, p: V2, t: V2, y: number, mat: string, h = 9) {
  cilinder(mb, 'metaal', { x: p.x, y, z: p.z }, { x: p.x, y: y + h, z: p.z }, 0.07, 0.05, 6);
  const m = { x: p.x + t.x * 0.75, z: p.z + t.z * 0.75 };
  mb.blok(mat, mat, { x: m.x, y: 0, z: m.z }, { x: t.x, y: 0, z: t.z }, { x: -t.z, y: 0, z: t.x }, 1.5, 0.03, y + h - 1.1, y + h - 0.1);
}

/** Fietsenrek met een paar fietsen (eenvoudig: frames als staafjes). */
export function fietsenrek(mb: MeshBouwer, c: V2, t: V2, y: number, aantal: number) {
  const n = nrm(t);
  for (let i = 0; i < aantal; i++) {
    const p = at(c, t, (i - aantal / 2) * 0.7, 0);
    const a = { x: p.x - n.x * 0.85, z: p.z - n.z * 0.85 }, b = { x: p.x + n.x * 0.85, z: p.z + n.z * 0.85 };
    for (const q of [a, b]) cilinder(mb, 'rubber', { x: q.x - t.x * 0.03, y: y + 0.34, z: q.z - t.z * 0.03 }, { x: q.x + t.x * 0.03, y: y + 0.34, z: q.z + t.z * 0.03 }, 0.34, 0.34, 10);
    cilinder(mb, i % 3 === 0 ? 'politieblauw' : i % 3 === 1 ? 'trimDonker' : 'remklauw', { x: a.x, y: y + 0.4, z: a.z }, { x: b.x, y: y + 0.75, z: b.z }, 0.03, 0.03, 4);
  }
}

/** Opslagtank met trap rondom (spiraal als losse treden) en een leuning op het dak. */
export function tank(mb: MeshBouwer, p: V2, y: number, r: number, h: number, mat = 'tank') {
  cilinder(mb, mat, { x: p.x, y: y - 0.2, z: p.z }, { x: p.x, y: y + h, z: p.z }, r, r, 22);
  cilinder(mb, mat, { x: p.x, y: y + h, z: p.z }, { x: p.x, y: y + h + r * 0.15, z: p.z }, r, r * 0.15, 22);
  // Ringen (lasnaden).
  for (let k = 1; k < h / 2.5; k++) cilinder(mb, 'metaal', { x: p.x, y: y + k * 2.5, z: p.z }, { x: p.x, y: y + k * 2.5 + 0.08, z: p.z }, r + 0.03, r + 0.03, 22);
  // Trap als treden die om de tank lopen.
  const n = Math.round(h / 0.4);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 1.2, yy = y + i * h / n;
    const q = { x: p.x + Math.cos(a) * (r + 0.45), z: p.z + Math.sin(a) * (r + 0.45) };
    mb.blok('metaal', 'metaal', { x: q.x, y: 0, z: q.z }, { x: -Math.sin(a), y: 0, z: Math.cos(a) }, { x: Math.cos(a), y: 0, z: Math.sin(a) }, 0.45, 0.8, yy, yy + 0.06);
  }
  // Leuning op het dak.
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, q = { x: p.x + Math.cos(a) * (r - 0.2), z: p.z + Math.sin(a) * (r - 0.2) }; cilinder(mb, 'metaal', { x: q.x, y: y + h, z: q.z }, { x: q.x, y: y + h + 1.1, z: q.z }, 0.04, 0.04, 4); }
}

/** Container (zeecontainer 6 m) in een kleur. */
export function container(mb: MeshBouwer, p: V2, t: V2, y: number, kleur: number) {
  const mat = `golfplaat:${kleur % 4}`;
  mb.blok(mat, mat, { x: p.x, y: 0, z: p.z }, { x: t.x, y: 0, z: t.z }, { x: -t.z, y: 0, z: t.x }, 6, 2.45, y, y + 2.6);
}
