import { fbm, worley } from '../noise';
import { hash01 } from '../rng';
import { C, Doek, K, TexData, frac, glad01, hsv, mix, mul, wikkel } from './doek';

// Alle texturen procedureel (geen externe assets). In commentaar: hoeveel meter één herhaling is;
// dezelfde maat staat in materialen.ts zodat de meshes er hun UV's (in meters) op afstemmen.

const loop = (d: Doek, f: (x: number, y: number, u: number, v: number) => void) => {
  for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) f(x, y, (x + 0.5) / d.W, (y + 0.5) / d.H);
};

// ═══════ ONDERGROND ═══════

/** Gras (gazon) of weide (ruiger, geler, met bloemetjes). 6 m. */
export function gras(weide: boolean, tuin = false): TexData {
  const d = new Doek(512, 512);
  const s = weide ? 10 : tuin ? 20 : 0;
  const donker = weide ? K(0.26, 0.31, 0.14) : K(0.19, 0.27, 0.11);
  const licht = weide ? K(0.47, 0.50, 0.25) : tuin ? K(0.34, 0.47, 0.18) : K(0.35, 0.44, 0.19);
  const droog = weide ? K(0.58, 0.53, 0.32) : K(0.47, 0.47, 0.27);
  loop(d, (x, y, u, v) => {
    const vlek = fbm(u, v, 3, 4, s + 1), mid = fbm(u, v, 12, 3, s + 2), pluk = fbm(u, v, 48, 2, s + 3), spriet = hash01(x, y, s + 4);
    let k = mix(donker, licht, mid * 0.7 + pluk * 0.3);
    k = mix(k, droog, glad01(0.45, 0.85, vlek) * (weide ? 0.7 : tuin ? 0.2 : 0.45));
    k = mul(k, 0.82 + 0.32 * spriet);
    if (weide) { const b = hash01(x >> 1, y >> 1, 77); if (b > 0.9965) k = b > 0.9985 ? K(0.95, 0.93, 0.8) : K(0.93, 0.8, 0.25); }
    d.zet(x, y, k, 0.55 * spriet + 0.45 * pluk, 0.08);
  });
  return d.naarTex(3);
}

/** Bosgrond: bladafval, aarde en mos. 5 m. */
export function bosgrond(): TexData {
  const d = new Doek(512, 512);
  const aarde = K(0.19, 0.13, 0.08), mos = K(0.18, 0.29, 0.09);
  loop(d, (x, y, u, v) => {
    const w = worley(u, v, 26, 31);
    const rand = Math.min(1, (w.f2 - w.f1) * 4), korrel = hash01(x, y, 33);
    let blad = mix(K(0.36, 0.20, 0.08), K(0.56, 0.34, 0.12), w.id);
    if (w.id > 0.82) blad = K(0.30, 0.27, 0.13);
    let k = mix(aarde, blad, rand * 0.9);
    k = mix(k, mos, glad01(0.55, 0.75, fbm(u, v, 4, 3, 32)) * 0.6);
    d.zet(x, y, mul(k, 0.85 + 0.3 * korrel), rand * 0.7 + korrel * 0.3, 0.1);
  });
  return d.naarTex(4);
}

/** Zand met fijne korrel en windribbels. 6 m. */
export function zand(): TexData {
  const d = new Doek(512, 512);
  loop(d, (x, y, u, v) => {
    const korrel = hash01(x, y, 41);
    const ribbel = Math.sin((v * 10 + fbm(u, v, 4, 2, 42) * 1.5) * Math.PI * 2) * 0.5 + 0.5;
    const k = mix(K(0.70, 0.62, 0.45), K(0.82, 0.74, 0.56), fbm(u, v, 3, 3, 43));
    d.zet(x, y, mul(k, (0.9 + 0.15 * korrel) * (0.95 + 0.06 * ribbel)), 0.5 * ribbel + 0.5 * korrel, 0.05);
  });
  return d.naarTex(2);
}

// ═══════ VERHARDING ═══════

/** Asfalt; rood = fietsasfalt, bus = roodbruine busbaan. 4 m. */
export function asfalt(soort: 'grijs' | 'rood' | 'bus'): TexData {
  const d = new Doek(512, 512);
  const rood = soort !== 'grijs';
  const basis = soort === 'rood' ? K(0.43, 0.16, 0.13) : soort === 'bus' ? K(0.36, 0.17, 0.14) : K(0.20, 0.20, 0.21);
  const steen = rood ? K(0.56, 0.34, 0.29) : K(0.43, 0.42, 0.41);
  const s = soort === 'rood' ? 60 : soort === 'bus' ? 70 : 50;
  loop(d, (x, y, u, v) => {
    const h = hash01(x, y, s + 1), h2 = hash01(x >> 1, y >> 1, s + 2);
    const vlek = fbm(u, v, 4, 4, s + 3), slijt = fbm(u, v, 16, 3, s + 4), teer = glad01(0.64, 0.74, fbm(u, v, 6, 3, s + 5));
    let k = mul(basis, 0.86 + 0.28 * vlek);
    if (h2 > 0.82) k = mix(k, steen, 0.6); else if (h2 < 0.12) k = mul(k, 0.72);
    k = mul(k, 0.92 + 0.12 * h);
    if (!rood) k = mix(k, mul(k, 0.72), teer * 0.6);
    let hoogte = h2 * 0.6 + h * 0.4;
    if (!rood) {
      // Reparatievlak (iets donkerder, rechte randen) en haarscheurtjes.
      const vx = Math.floor(u * 3), vy = Math.floor(v * 3);
      if (hash01(vx, vy, s + 6) > 0.8) { const fx = frac(u * 3), fy = frac(v * 3); if (fx > 0.15 && fx < 0.75 && fy > 0.2 && fy < 0.6) k = mul(k, 0.8); }
      const w = worley(u, v, 7, s + 7);
      const scheur = 1 - glad01(0, 0.012, w.f2 - w.f1);
      if (hash01(Math.floor(u * 7), Math.floor(v * 7), s + 8) > 0.55) { k = mul(k, 1 - 0.45 * scheur); hoogte -= scheur * 0.5; }
    }
    d.zet(x, y, k, hoogte, 0.10 + 0.20 * teer + 0.05 * slijt);
  });
  return d.naarTex(2.5);
}

/** Gebakken klinkers in halfsteensverband. 2,1 m. */
export function klinkers(): TexData {
  const d = new Doek(512, 512);
  const tinten: C[] = [K(0.45, 0.22, 0.14), K(0.38, 0.18, 0.12), K(0.52, 0.28, 0.17), K(0.31, 0.17, 0.12), K(0.47, 0.25, 0.18)];
  const voeg = K(0.32, 0.29, 0.24);
  loop(d, (x, y, u, v) => {
    const sv = v * 20, rij = Math.floor(sv);
    const lu = u * 10 + ((rij & 1) ? 0.5 : 0), kol = Math.floor(lu);
    const fx = lu - kol, fy = sv - rij;
    const rand = Math.min(Math.min(fx, 1 - fx) * 0.21, Math.min(fy, 1 - fy) * 0.105);
    if (rand < 0.004) { d.zet(x, y, mul(voeg, 0.9 + 0.2 * hash01(x, y, 64)), 0.1, 0.05); return; }
    const sh = hash01(wikkel(kol, 10), wikkel(rij, 20), 61);
    const k = mul(tinten[Math.min(4, Math.floor(sh * 5))], (0.9 + 0.15 * fbm(u, v, 32, 2, 62)) * (0.93 + 0.1 * hash01(x, y, 63)));
    d.zet(x, y, k, 0.4 + 0.6 * glad01(0.004, 0.016, rand), 0.18);
  });
  return d.naarTex(5);
}

/** Betonnen stoeptegels 30x30 (of grotere erfverharding 50x50). 1,8 m / 3 m. */
export function tegels(groot = false): TexData {
  const d = new Doek(512, 512);
  const n = 6, s = groot ? 90 : 70;
  loop(d, (x, y, u, v) => {
    const su = u * n, sv = v * n, kol = Math.floor(su), rij = Math.floor(sv);
    const fx = su - kol, fy = sv - rij;
    const rand = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy)) * 0.3;
    if (rand < 0.003) { d.zet(x, y, K(0.30, 0.30, 0.29), 0.1, 0.05); return; }
    const g = (groot ? 0.5 : 0.56) + (hash01(wikkel(kol, n), wikkel(rij, n), s + 1) - 0.5) * 0.09;
    let k = K(g, g, g * 0.97);
    k = mul(k, 0.93 + 0.1 * hash01(x, y, s + 2) + 0.07 * fbm(u, v, 24, 2, s + 3));
    k = mul(k, 1 - 0.12 * glad01(0.6, 0.8, fbm(u, v, 3, 3, s + 4)));
    d.zet(x, y, k, 0.4 + 0.6 * glad01(0.003, 0.012, rand), 0.15);
  });
  return d.naarTex(4);
}

/** Beton. 2 m. */
export function beton(tint: C = K(0.62, 0.61, 0.58)): TexData {
  const d = new Doek(256, 256);
  loop(d, (x, y, u, v) => {
    const vlek = fbm(u, v, 4, 4, 81), por = hash01(x, y, 82);
    let k = mul(tint, (0.86 + 0.22 * vlek) * (0.95 + 0.08 * por));
    let h = 0.6 + 0.2 * vlek;
    if (por > 0.996) { k = mul(k, 0.6); h = 0.3; }
    if (frac(v * 2) < 0.008) { k = mul(k, 0.85); h = 0.45; }
    d.zet(x, y, k, h, 0.2);
  });
  return d.naarTex(2);
}

// ═══════ GEVELS ═══════

interface GevelP { muur: C; voeg: C; kozijn: C; dorpel: C; rb: number; rh: number; borst: number; kd: number; variatie: number; baksteen?: boolean; paneel?: boolean; roede?: boolean; bovenlicht?: boolean; rollaag?: boolean; vuil?: boolean }

function gevelP(stijl: string): GevelP {
  const p: GevelP = { muur: K(0.66, 0.65, 0.61), voeg: K(0.72, 0.70, 0.66), kozijn: K(0.92, 0.92, 0.90), dorpel: K(0.74, 0.73, 0.70), rb: 1.5, rh: 1.6, borst: 0.85, kd: 0.07, variatie: 0.07 };
  switch (stijl) {
    case 'baksteenRood': Object.assign(p, { muur: K(0.50, 0.22, 0.15), baksteen: true, roede: true, bovenlicht: true, rollaag: true }); break;
    case 'baksteenBruin': Object.assign(p, { muur: K(0.34, 0.20, 0.14), voeg: K(0.55, 0.52, 0.48), kozijn: K(0.13, 0.24, 0.17), rb: 1.4, rh: 1.75, baksteen: true, roede: true, rollaag: true }); break;
    case 'baksteenGeel': Object.assign(p, { muur: K(0.72, 0.60, 0.38), voeg: K(0.76, 0.74, 0.69), rb: 1.6, rh: 1.5, borst: 0.9, variatie: 0.05, baksteen: true, bovenlicht: true }); break;
    case 'stuc': Object.assign(p, { muur: K(0.87, 0.85, 0.79), kozijn: K(0.18, 0.19, 0.20), dorpel: K(0.30, 0.31, 0.32), rb: 1.8, rh: 1.9, borst: 0.6, kd: 0.05, vuil: true }); break;
    case 'modernDonker': Object.assign(p, { muur: K(0.20, 0.21, 0.22), kozijn: K(0.11, 0.11, 0.12), dorpel: K(0.11, 0.11, 0.12), rb: 2.3, rh: 2.45, borst: 0.15, kd: 0.05, paneel: true }); break;
    case 'plint': Object.assign(p, { muur: K(0.22, 0.16, 0.13), voeg: K(0.40, 0.38, 0.35), baksteen: true }); break;
  }
  return p;
}

function baksteen(muur: C, voeg: C, variatie: number, x: number, y: number, mx: number, my: number, s: number): [C, number, number] {
  const lagen = my / 0.0625, rij = Math.floor(lagen), fy = lagen - rij;
  const stenen = mx / (6 / 28) + ((rij & 1) ? 0.5 : 0), kol = Math.floor(stenen), fx = stenen - kol;
  if (fy < 0.16 || fx < 0.05) return [mul(voeg, 0.92 + 0.12 * hash01(x, y, s + 6)), 0.55, 0.05];
  const sh = hash01(wikkel(kol, 28), wikkel(rij, 96), s + 7);
  let k = mul(muur, 1 + (sh - 0.5) * 2 * variatie);
  if (hash01(wikkel(kol, 28), wikkel(rij, 96), s + 8) > 0.93) k = mul(k, 0.78);
  return [mul(k, 0.93 + 0.1 * hash01(x, y, s + 9)), 0.85 + 0.05 * hash01(x, y, s + 10), 0.12];
}

function glas(u: number, v: number, lx: number, ly: number, rb: number, rh: number, raamId: number, s: number): C {
  let g = mix(K(0.09, 0.12, 0.16), K(0.33, 0.41, 0.49), Math.min(1, ly / rh) * 0.85);
  const r = hash01(raamId, s, 7);
  if (r < 0.3) {
    if (lx < rb * 0.2 || lx > rb * 0.8) {
      const kk = hash01(raamId, s, 8);
      const gordijn = kk < 0.33 ? K(0.62, 0.55, 0.44) : kk < 0.66 ? K(0.45, 0.45, 0.46) : K(0.48, 0.22, 0.18);
      g = mix(g, mul(gordijn, 0.8 + 0.2 * Math.sin(lx * 60)), 0.75);
    }
  } else if (r < 0.5) {
    if (ly > rh * 0.45 && frac(ly / 0.04) < 0.55) g = mix(g, K(0.74, 0.73, 0.70), 0.7);
  } else if (r < 0.62) g = mix(g, K(0.58, 0.47, 0.33), 0.45);
  g = mul(g, 0.9 + 0.2 * fbm(u, v, 16, 2, s + 11));
  if (ly > rh - 0.12) g = mul(g, 0.6);
  if (lx < 0.08) g = mul(g, 0.75);
  return g;
}

/** Gevel van 2 traveeën × 2 verdiepingen (6 × 6 m); `ramen=false` geeft hetzelfde muurwerk zonder ramen. */
export function gevel(stijl: string, ramen: boolean): TexData {
  const d = new Doek(ramen ? 1024 : 512, ramen ? 1024 : 512);
  const p = gevelP(stijl);
  const s = 100 + stijl.length * 13;
  loop(d, (x, y, u, v) => {
    const mx = u * 6, my = v * 6;
    const travee = mx < 3 ? 0 : 1, vloer = my < 3 ? 0 : 1;
    const bx = mx - travee * 3, by = my - vloer * 3;
    const raamId = travee + vloer * 2;
    if (stijl === 'vliesgevel') return vliesgevel(d, x, y, u, v, mx, ramen ? by : 0.1, raamId, s);
    if (stijl === 'betonband') return betonband(d, x, y, u, v, mx, bx, ramen ? by : 0.5, raamId, s);
    let k: C, h: number, gl: number;
    if (p.baksteen) [k, h, gl] = baksteen(p.muur, p.voeg, p.variatie, x, y, mx, my, s);
    else if (p.paneel) {
      k = mul(p.muur, 0.95 + 0.08 * fbm(u, v, 8, 3, s + 1)); h = 0.8; gl = 0.25;
      if (frac(mx / 0.75) * 0.75 < 0.012 || by < 0.02) { k = mul(k, 0.55); h = 0.6; }
    } else { k = mul(p.muur, 0.94 + 0.1 * fbm(u, v, 8, 3, s + 1)); h = 0.8 + 0.04 * fbm(u, v, 32, 2, s + 2); gl = 0.15; }
    const rx0 = (3 - p.rb) / 2, rx1 = rx0 + p.rb, ry0 = p.borst, ry1 = p.borst + p.rh;
    if (!ramen) { d.zet(x, y, k, h, gl); return; }
    if (p.vuil && bx > rx0 && bx < rx1 && by < ry0) {
      const streep = fbm(u, v, 64, 2, s + 3), af = 1 - Math.min(1, Math.max(0, (ry0 - by) / ry0));
      k = mul(k, 1 - 0.18 * af * glad01(0.45, 0.7, streep));
    }
    if (p.rollaag && by > ry1 && by < ry1 + 0.2 && bx > rx0 - 0.1 && bx < rx1 + 0.1) {
      const vg = frac(mx / 0.065) < 0.15 || by - ry1 < 0.01;
      k = vg ? p.voeg : mul(p.muur, 0.85 + 0.2 * hash01(Math.floor(mx / 0.065), vloer, s + 4)); h = vg ? 0.55 : 0.88; gl = 0.1;
    }
    if (by > ry0 - 0.07 && by <= ry0 && bx > rx0 - 0.05 && bx < rx1 + 0.05) { k = mul(p.dorpel, 0.95 + 0.08 * hash01(x, y, s + 5)); h = 0.97; gl = 0.3; }
    if (bx >= rx0 && bx <= rx1 && by >= ry0 && by <= ry1) {
      const lx = bx - rx0, ly = by - ry0, t = p.kd;
      const kozijn = lx < t || lx > p.rb - t || ly < t || ly > p.rh - t || (!!p.roede && Math.abs(lx - p.rb / 2) < t / 2) || (!!p.bovenlicht && Math.abs(ly - p.rh * 0.72) < t / 2);
      if (kozijn) { k = p.kozijn; h = 0.7; gl = 0.45; } else { k = glas(u, v, lx, ly, p.rb, p.rh, raamId, s); h = 0.1; gl = 0.93; }
    }
    d.zet(x, y, k, h, gl);
  });
  return d.naarTex(6);
}

function vliesgevel(d: Doek, x: number, y: number, u: number, v: number, mx: number, by: number, raamId: number, s: number) {
  const stijl = frac(mx / 1.5) * 1.5 < 0.05, regel = (by > 0.88 && by < 0.93) || by > 2.95;
  if (stijl || regel) { d.zet(x, y, K(0.55, 0.56, 0.58), 0.85, 0.6, 0.6); return; }
  if (by < 0.88) { d.zet(x, y, mul(K(0.11, 0.13, 0.16), 0.95 + 0.1 * fbm(u, v, 8, 2, s + 1)), 0.5, 0.82); return; }
  const paneel = Math.floor(mx / 1.5) + raamId * 7;
  let g = mix(K(0.13, 0.19, 0.25), K(0.42, 0.52, 0.62), Math.min(1, Math.max(0, (by - 0.9) / 2.05)));
  g = mul(g, 0.92 + 0.12 * hash01(paneel, 3, s));
  if (hash01(paneel, 4, s) > 0.75) g = mix(g, K(0.55, 0.52, 0.45), 0.35);
  d.zet(x, y, g, 0.3, 0.95, 0.1);
}

function betonband(d: Doek, x: number, y: number, u: number, v: number, mx: number, bx: number, by: number, raamId: number, s: number) {
  if (by < 1.0 || by > 2.65) {
    let k = mul(K(0.68, 0.67, 0.63), 0.88 + 0.2 * fbm(u, v, 6, 3, s + 1)); let h = 0.85;
    if (bx < 0.015 || Math.abs(by - 1.0) < 0.015) { k = mul(k, 0.6); h = 0.6; }
    d.zet(x, y, k, h, 0.2); return;
  }
  if (frac(mx / 1.2) * 1.2 < 0.05 || by < 1.04 || by > 2.61) { d.zet(x, y, K(0.16, 0.16, 0.17), 0.7, 0.45); return; }
  d.zet(x, y, glas(u, v, frac(mx / 1.2) * 1.2, by - 1.0, 1.2, 1.65, raamId * 5 + Math.floor(mx / 1.2), s), 0.1, 0.93);
}

/** Golfplaat (verticaal geribd); u en v in meters, 4 m. */
export function golfplaat(tint: C, dak = false): TexData {
  const d = new Doek(256, 256);
  loop(d, (x, y, u, v) => {
    const mx = u * 4, my = v * 4;
    const rib = Math.sin((dak ? my : mx) / 0.2 * Math.PI * 2) * 0.5 + 0.5;
    let k = mul(tint, (0.80 + 0.25 * rib) * (0.95 + 0.07 * fbm(u, v, 6, 3, 191)));
    if ((dak ? frac(mx / 1.0) : frac(my / 2.0)) < 0.012) k = mul(k, 0.7);
    // Wat roestsporen en vuil onderaan.
    if (!dak) k = mul(k, 1 - 0.15 * glad01(0.6, 0.85, fbm(u, v * 0.5, 6, 3, 192)) * (1 - v));
    d.zet(x, y, k, rib, 0.35, 0.45);
  });
  return d.naarTex(3);
}

/** Roldeur van een laadperron: horizontale lamellen, 4 m. */
export function roldeur(): TexData {
  const d = new Doek(128, 128);
  loop(d, (x, y, u, v) => {
    const l = frac(v * 4 * 4 / 0.25 / 4);
    const k = mul(K(0.55, 0.57, 0.6), (0.75 + 0.25 * Math.sin(l * Math.PI)) * (0.95 + 0.05 * hash01(x, y, 3)));
    d.zet(x, y, k, Math.sin(l * Math.PI), 0.4, 0.5);
  });
  return d.naarTex(3);
}

/** Winkelpui: plint, etalage met schappen, deur, reclamebord, lijst. 6 × 4,5 m, uv direct. */
export function winkelpui(variant: number): TexData {
  const W = 512, H = 384, d = new Doek(W, H);
  const kleuren: C[] = [K(0.55, 0.10, 0.10), K(0.08, 0.25, 0.15), K(0.08, 0.12, 0.30), K(0.10, 0.10, 0.10), K(0.75, 0.40, 0.10), K(0.86, 0.86, 0.83)];
  const s = 300 + variant * 10;
  const huis = kleuren[wikkel(variant, kleuren.length)];
  const letter = variant === 5 ? K(0.1, 0.1, 0.1) : K(0.95, 0.93, 0.85);
  const deurT = variant & 1;
  loop(d, (x, y, u, v) => {
    const mx = u * 6, my = v * 4.5, travee = mx < 3 ? 0 : 1, bx = mx - travee * 3;
    if (my < 0.35) { d.zet(x, y, mul(K(0.16, 0.16, 0.17), 0.92 + 0.12 * hash01(x, y, s)), 0.9, 0.4); return; }
    if (my < 3.05) {
      let kader = bx < 0.08 || bx > 2.92 || my < 0.43 || my > 2.97;
      const deur = travee === deurT && bx > 1.0 && bx < 2.0 && my < 2.6;
      if (deur) kader = kader || bx < 1.06 || bx > 1.94 || my > 2.54 || (Math.abs(bx - 1.85) < 0.02 && Math.abs(my - 1.3) < 0.25);
      if (kader) { d.zet(x, y, K(0.12, 0.12, 0.13), 0.8, 0.5, 0.4); return; }
      let binnen = K(0.62, 0.55, 0.45);
      if (!deur && my > 0.6 && my < 2.6) {
        const plank = frac((my - 0.6) / 0.4);
        if (plank < 0.08) binnen = K(0.5, 0.5, 0.5);
        else binnen = mul(hsv(hash01(Math.floor(mx / 0.12), Math.floor((my - 0.6) / 0.4), s + 1), 0.45, 0.75), 0.7 + 0.3 * plank);
      }
      const refl = mix(K(0.12, 0.15, 0.19), K(0.42, 0.50, 0.58), Math.min(1, Math.max(0, (my - 0.4) / 2.6)));
      d.zet(x, y, mix(binnen, refl, 0.4), 0.2, 0.92); return;
    }
    if (my < 3.75) {
      let k = mul(huis, 0.93 + 0.08 * fbm(u, v, 12, 2, s + 2)); let h = 0.85;
      const vak = bx > 0.6 && bx < 2.4 && my > 3.25 && my < 3.55;
      if (vak && hash01(Math.floor(mx / 0.12), travee, s + 3) > 0.3 && frac(mx / 0.12) < 0.72) { k = letter; h = 0.95; }
      if (my < 3.09 || my > 3.71) { k = mul(k, 0.6); h = 0.7; }
      d.zet(x, y, k, h, 0.45); return;
    }
    let st = mul(K(0.30, 0.28, 0.27), 0.9 + 0.15 * fbm(u, v, 16, 3, s + 4)); let hh = 0.8;
    if (my < 3.82) { st = K(0.78, 0.77, 0.73); hh = 1; }
    d.zet(x, y, st, hh, 0.2);
  });
  return d.naarTex(5);
}

/** Luifel met strepen; u in meters (strepen van 0,3 m). */
export function luifel(variant: number): TexData {
  const d = new Doek(128, 64);
  const kl: C[] = [K(0.62, 0.12, 0.12), K(0.10, 0.30, 0.18), K(0.12, 0.20, 0.42), K(0.75, 0.48, 0.12)];
  const a = kl[wikkel(variant, 4)], b = K(0.9, 0.88, 0.82);
  loop(d, (x, y, u, v) => {
    const streep = frac(u * 2) < 0.5;
    const k = mul(streep ? a : b, 0.9 + 0.1 * hash01(x, y, 5) - 0.12 * v);
    d.zet(x, y, k, 0.5 + 0.1 * Math.sin(u * 40), 0.15);
  });
  return d.naarTex(1);
}

// ═══════ DAKEN ═══════

/** Keramische dakpannen. 2 m. */
export function dakpannen(antraciet: boolean): TexData {
  const d = new Doek(256, 256);
  const basis = antraciet ? K(0.17, 0.17, 0.18) : K(0.55, 0.22, 0.14), donker = antraciet ? K(0.12, 0.12, 0.13) : K(0.42, 0.17, 0.11);
  const s = antraciet ? 410 : 400;
  loop(d, (x, y, u, v) => {
    const sv = v * 6, su = u * 8, rij = Math.floor(sv), kol = Math.floor(su), fy = sv - rij, fx = su - kol;
    const golf = Math.sin(fx * Math.PI * 2) * 0.5 + 0.5;
    const pan = hash01(wikkel(kol, 8), wikkel(rij, 6), s);
    let k = mix(basis, donker, pan > 0.85 ? 0.8 : pan * 0.35);
    k = mul(k, 0.82 + 0.18 * golf);
    // De pannen liggen dakrand → nok (v omhoog); de overlap van de rij erboven geeft schaduw bovenaan elke rij.
    if (fy > 0.88) k = mul(k, 0.55);
    k = mul(k, 0.94 + 0.08 * hash01(x, y, s + 1));
    d.zet(x, y, k, 0.35 + 0.35 * golf + (1 - fy) * 0.3, antraciet ? 0.5 : 0.25);
  });
  return d.naarTex(5);
}

/** Plat dak: bitumen met grind. 3 m. */
export function dakgrind(): TexData {
  const d = new Doek(256, 256);
  loop(d, (x, y, u, v) => {
    const w = worley(u, v, 40, 501);
    const g = 0.40 + 0.2 * w.id;
    let k = mix(K(0.14, 0.14, 0.15), K(g, g * 0.98, g * 0.95), glad01(0, 0.25, w.f2 - w.f1));
    k = mul(k, 0.9 + 0.15 * fbm(u, v, 4, 3, 502));
    d.zet(x, y, k, 1 - w.f1, 0.1);
  });
  return d.naarTex(3);
}

// ═══════ ERF EN BOUWPLAATS ═══════

/** Heg (liguster/beuk): dicht blad zonder gaten. 2 m. */
export function haag(): TexData {
  const d = new Doek(256, 256);
  loop(d, (x, y, u, v) => {
    const w = worley(u, v, 22, 901);
    const pluk = 1 - glad01(0, 0.7, w.f1);
    const k = mul(mix(K(0.10, 0.20, 0.06), K(0.28, 0.42, 0.13), pluk * 0.7 + w.id * 0.3), 0.85 + 0.25 * hash01(x, y, 902));
    d.zet(x, y, k, pluk, 0.2);
  });
  return d.naarTex(4);
}

/** Verticale houten planken (schuttingen, schuurtjes). 2 m. */
export function hout(): TexData {
  const d = new Doek(256, 256);
  loop(d, (x, y, u, v) => {
    const pl = u * 14, i = Math.floor(pl), f = pl - i;
    const nerf = fbm(u * 0.2 + i * 0.37, v, 2, 3, 920 + i);
    let k = mix(K(0.36, 0.25, 0.16), K(0.52, 0.38, 0.24), hash01(i, 0, 921) * 0.6 + nerf * 0.4);
    if (f < 0.06) k = mul(k, 0.45);
    d.zet(x, y, mul(k, 0.9 + 0.12 * hash01(x, y, 922)), f < 0.06 ? 0.2 : 0.7 + nerf * 0.2, 0.15);
  });
  return d.naarTex(3);
}

/** Bouwkeet: geribde container. 3 m. */
export function keet(): TexData {
  const d = new Doek(128, 128);
  loop(d, (x, y, u, v) => {
    const rib = Math.abs(Math.sin(u * 3 / 0.3 * Math.PI));
    const k = mul(K(0.20, 0.34, 0.52), (0.75 + 0.25 * rib) * (0.92 + 0.1 * fbm(u, v, 4, 2, 931)));
    d.zet(x, y, k, rib, 0.35, 0.3);
  });
  return d.naarTex(3);
}

/** Steigerwerk met alfa. 2 m. */
export function steiger(): TexData {
  const d = new Doek(256, 256, true);
  loop(d, (x, y, u, v) => {
    const mx = u * 2, my = v * 2;
    const staander = mx < 0.05, ligger = my < 0.05 || (my > 1.0 && my < 1.045), plank = my > 0.05 && my < 0.2, schoor = Math.abs(mx - my) < 0.03;
    if (plank) d.zet(x, y, mul(K(0.62, 0.48, 0.28), 0.85 + 0.2 * hash01(x, y >> 2, 601)), 0.8, 0.2, 0, 1);
    else if (staander || ligger || schoor) d.zet(x, y, K(0.62, 0.63, 0.65), 1, 0.5, 0.7, 1);
    else d.zet(x, y, K(0.5, 0.5, 0.5), 0, 0, 0, 0);
  });
  return d.naarTex(3);
}

/** Bouwhek (Heras): gaas in buisframe, met alfa. 3,5 m breed × 2 m. */
export function hekwerk(): TexData {
  const d = new Doek(256, 128, true);
  loop(d, (x, y, u, v) => {
    const mx = u * 3.5, my = v * 2;
    const frame = mx < 0.04 || mx > 3.46 || my < 0.05 || my > 1.95;
    const gaas = frac(mx / 0.1) < 0.08 || frac(my / 0.2) < 0.05;
    if (frame) d.zet(x, y, K(0.7, 0.71, 0.72), 1, 0.5, 0.8, 1);
    else if (gaas) d.zet(x, y, K(0.6, 0.61, 0.62), 0.7, 0.4, 0.8, 0.9);
    else d.zet(x, y, K(0.5, 0.5, 0.5), 0, 0, 0, 0);
  });
  return d.naarTex(2);
}

// ═══════ BOMEN ═══════

/** Schors: groeven of witte berkenbast. u = rondom, v = hoogte (2 m). */
export function schors(berk: boolean): TexData {
  const d = new Doek(128, 256);
  loop(d, (x, y, u, v) => {
    if (berk) {
      let k = mul(K(0.86, 0.85, 0.80), 0.92 + 0.1 * hash01(x, y, 701)); let h = 0.7;
      const len = hash01(Math.floor(u * 16), Math.floor(v * 64), 702) > 0.8 && frac(v * 64) < 0.35;
      if (len) { k = K(0.16, 0.14, 0.13); h = 0.4; }
      k = mix(k, K(0.12, 0.11, 0.10), glad01(0.68, 0.78, fbm(u, v, 4, 3, 703)) * 0.85);
      d.zet(x, y, k, h, 0.2);
    } else {
      const groef = Math.abs(Math.sin((u * 6 + (fbm(u, v, 4, 3, 711) - 0.5) * 1.2) * Math.PI));
      d.zet(x, y, mul(K(0.29, 0.23, 0.18), (0.6 + 0.5 * groef) * (0.9 + 0.2 * hash01(x, y, 712))), groef, 0.12);
    }
  });
  return d.naarTex(4);
}

const BLADKLEUR: Record<string, [C, C]> = {
  eik: [K(0.13, 0.25, 0.07), K(0.34, 0.47, 0.14)],
  linde: [K(0.17, 0.32, 0.09), K(0.42, 0.57, 0.18)],
  berk: [K(0.25, 0.40, 0.12), K(0.55, 0.66, 0.24)],
  den: [K(0.07, 0.17, 0.09), K(0.18, 0.32, 0.15)],
  plataan: [K(0.18, 0.31, 0.09), K(0.44, 0.56, 0.19)],
};

/** Bladtros met alfa: honderden losse blaadjes (of naaldtakjes) in een ronde wolk. */
export function bladkaart(soort: string): TexData {
  const N = 512, d = new Doek(N, N, true);
  const [donker, licht] = BLADKLEUR[soort] ?? BLADKLEUR.eik;
  const s = 800 + soort.length * 17;
  // Achtergrond leeg.
  for (let i = 0; i < N * N; i++) d.alfa![i] = 0;
  const naald = soort === 'den';
  const aantal = naald ? 260 : 900;
  for (let b = 0; b < aantal; b++) {
    // Verdeling: dichter in het midden van de tros.
    const r = Math.sqrt(hash01(b, 1, s)) * 0.44, a = hash01(b, 2, s) * Math.PI * 2;
    const cx = 0.5 + Math.cos(a) * r, cy = 0.5 + Math.sin(a) * r * (naald ? 0.6 : 1);
    const hoek = naald ? a + (hash01(b, 6, s) - 0.5) * 0.6 : hash01(b, 3, s) * Math.PI * 2;
    const lang = (naald ? 0.16 : soort === 'berk' ? 0.045 : soort === 'plataan' ? 0.075 : 0.06) * (0.75 + 0.5 * hash01(b, 4, s));
    const breed = naald ? 0.012 : lang * (soort === 'eik' ? 0.55 : 0.62);
    const toon = hash01(b, 5, s);
    // Licht aan de bovenkant van de tros, donker onderin (zelfschaduw).
    const licht01 = Math.min(1, Math.max(0, 0.25 + toon * 0.5 + (cy - 0.5) * 0.9));
    const kleur = mix(donker, licht, licht01);
    const ca = Math.cos(hoek), sa = Math.sin(hoek);
    const ext = Math.ceil(lang * N) + 2;
    const px = Math.floor(cx * N), py = Math.floor(cy * N);
    for (let yy = -ext; yy <= ext; yy++) for (let xx = -ext; xx <= ext; xx++) {
      const x = px + xx, y = py + yy;
      if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
      const lx = (xx * ca + yy * sa) / N, ly = (-xx * sa + yy * ca) / N;
      let inBlad: number;
      if (naald) inBlad = Math.abs(ly) < breed * (1 - Math.abs(lx) / lang) && Math.abs(lx) < lang ? 1 : 0;
      else { const t = lx / lang; inBlad = t > -1 && t < 1 && Math.abs(ly) < breed * Math.sqrt(Math.max(0, 1 - t * t)) * (t > 0 ? 1 - t * 0.35 : 1) ? 1 : 0; }
      if (!inBlad) continue;
      // Nerf en lichte bolling.
      const nerf = !naald && Math.abs(ly) < 0.0025 ? 0.85 : 1;
      const bol = 1 - Math.abs(ly) / Math.max(1e-4, breed);
      const i = y * N + x;
      d.kleur[i * 3] = kleur[0] * nerf * (0.85 + 0.2 * bol); d.kleur[i * 3 + 1] = kleur[1] * nerf * (0.85 + 0.2 * bol); d.kleur[i * 3 + 2] = kleur[2] * nerf * (0.85 + 0.2 * bol);
      d.hoogte[i] = 0.4 + 0.5 * bol + b / aantal * 0.1; d.glad[i] = 0.35; d.metaal[i] = 0; d.alfa![i] = 1;
    }
  }
  // Kleur ook in transparante pixels doorgeven (voorkomt donkere randen bij mipmaps).
  for (let i = 0; i < N * N; i++) if (d.alfa![i] === 0) { d.kleur[i * 3] = donker[0]; d.kleur[i * 3 + 1] = donker[1]; d.kleur[i * 3 + 2] = donker[2]; d.hoogte[i] = 0.3; }
  return d.naarTex(3);
}

/** Dichte bladmassa (kern van de kroon), geen alfa. */
export function bladkern(soort: string): TexData {
  const d = new Doek(128, 128);
  const [donker, licht] = BLADKLEUR[soort] ?? BLADKLEUR.eik;
  loop(d, (x, y, u, v) => {
    const w = worley(u, v, 10, 950);
    const k = mul(mix(donker, licht, (1 - w.f1) * 0.35 + v * 0.25), 0.6 + 0.25 * hash01(x, y, 951));
    d.zet(x, y, k, 1 - w.f1, 0.2);
  });
  return d.naarTex(2);
}

// ═══════ WATER ═══════

/** Golfjes als normal map (herhalend). 24 m. */
export function waterNormaal(): TexData {
  const d = new Doek(512, 512);
  loop(d, (x, y, u, v) => {
    const h = fbm(u, v, 6, 5, 1001, 0.55) * 0.7 + fbm(u + 0.3, v * 1.2, 16, 3, 1002) * 0.3;
    d.zet(x, y, K(0.5, 0.5, 1), h, 0.95);
  });
  return d.naarTex(6, false);
}

// ═══════ AKKERS ═══════

/** Gewas op een akker; v loopt dwars op de rijen. Eén herhaling = 8 × 8 m. */
export function akker(gewas: string): TexData {
  const N = 256, d = new Doek(N, N);
  const s = 1200 + gewas.length * 7;
  const tulpKleuren: C[] = [K(0.80, 0.08, 0.10), K(0.95, 0.80, 0.10), K(0.92, 0.45, 0.60), K(0.45, 0.15, 0.55), K(0.95, 0.94, 0.90), K(0.95, 0.45, 0.08)];
  loop(d, (x, y, u, v) => {
    const mv = v * 8, mu = u * 8;
    const ruis = fbm(u, v, 8, 3, s), korrel = hash01(x, y, s + 1);
    const grond = mix(K(0.30, 0.22, 0.15), K(0.42, 0.32, 0.22), fbm(u, v, 16, 2, s + 2));
    let k: C, h = 0.5;
    switch (gewas) {
      case 'tarwe': {
        const rij = 0.5 + 0.5 * Math.sin(mv / 0.15 * Math.PI * 2);
        k = mix(K(0.66, 0.58, 0.30), K(0.80, 0.70, 0.38), ruis * 0.7 + rij * 0.3);
        k = mul(k, 0.85 + 0.25 * korrel); h = 0.4 + 0.4 * korrel; break;
      }
      case 'mais': {
        const f = frac(mv / 0.75), plant = glad01(0.15, 0.3, f) * (1 - glad01(0.7, 0.85, f));
        const blad = mix(K(0.17, 0.32, 0.08), K(0.30, 0.48, 0.14), ruis);
        k = mix(grond, mul(blad, 0.8 + 0.4 * korrel), 0.35 + 0.65 * plant); h = plant; break;
      }
      case 'aardappel': {
        const f = frac(mv / 0.75), rug = Math.sin(f * Math.PI);
        const loof = mix(K(0.12, 0.24, 0.07), K(0.24, 0.38, 0.12), ruis);
        k = mix(grond, mul(loof, 0.8 + 0.4 * korrel), glad01(0.3, 0.7, rug)); h = rug; break;
      }
      case 'gras': {
        const maaibaan = frac(mv / 4) < 0.5 ? 1 : 0.9;
        k = mul(mix(K(0.22, 0.38, 0.12), K(0.36, 0.52, 0.18), ruis), (0.85 + 0.25 * korrel) * maaibaan); h = korrel; break;
      }
      case 'tulpen': {
        const band = Math.floor(mv / 2), f = frac(mv / 0.4);
        const kleur = tulpKleuren[wikkel(band + Math.floor(hash01(band, 0, s) * 3), tulpKleuren.length)];
        const bloem = glad01(0.2, 0.35, f) * (1 - glad01(0.65, 0.8, f)) * (0.7 + 0.3 * hash01(x >> 1, y >> 1, s + 3));
        const blad = mix(K(0.18, 0.34, 0.12), K(0.28, 0.44, 0.16), ruis);
        k = mix(mix(grond, blad, 0.6), kleur, bloem * 0.9); h = bloem; break;
      }
      default: {
        const voor = 0.5 + 0.5 * Math.sin((mv + ruis * 0.3) / 0.35 * Math.PI * 2);
        k = mul(grond, 0.8 + 0.3 * voor + 0.1 * korrel); h = voor;
      }
    }
    void mu;
    d.zet(x, y, k, h, 0.08);
  });
  return d.naarTex(3);
}

/** Sloot: donker water met kroos. */
export function sloot(): TexData {
  const d = new Doek(128, 128);
  loop(d, (x, y, u, v) => {
    const kroos = glad01(0.55, 0.7, fbm(u, v, 6, 3, 1301));
    const k = mix(K(0.10, 0.14, 0.12), K(0.35, 0.48, 0.15), kroos * 0.8);
    d.zet(x, y, mul(k, 0.9 + 0.15 * hash01(x, y, 1302)), kroos * 0.6, 0.9 - kroos * 0.6);
  });
  return d.naarTex(1.5);
}

/** Grind: ronde steentjes in grijs-beige. */
export function grind(): TexData {
  const d = new Doek(256, 256);
  loop(d, (x, y, u, v) => {
    const w = worley(u, v, 48, 1401);
    const steen = mix(K(0.52, 0.48, 0.42), K(0.72, 0.66, 0.56), w.id);
    const k = mix(K(0.28, 0.25, 0.22), steen, glad01(0, 0.2, w.f2 - w.f1));
    d.zet(x, y, mul(k, 0.9 + 0.15 * hash01(x, y, 1402)), 1 - w.f1, 0.15);
  });
  return d.naarTex(3);
}
