import { V2, V3 } from '../math';
import { Rng } from '../rng';
import { Gebouw, Perceel, totaleHoogte } from '../wereld';
import { MeshBouwer, MeshData, Prop } from './mesh';

// Gevelstijlen: elk is een textuur van 2 traveeën × 2 verdiepingen (zie tex/gevels.ts).
export const GEVELSTIJLEN = ['baksteenRood', 'baksteenBruin', 'baksteenGeel', 'stuc', 'modernDonker', 'vliesgevel', 'betonband'] as const;
export type GevelStijl = typeof GEVELSTIJLEN[number];
export const DEURKLEUREN = 5;
export const PUIEN = 4;
export const LUIFELS = 4;
export const HALTINTEN = 4;

type H = (x: number, z: number) => number;

/** Lokaal assenstelsel van een gebouw: u langs de straat, v naar de straat, y omhoog vanaf het vloerpeil. */
class Lokaal {
  constructor(readonly c: V2, readonly y0: number, readonly ax: V2, readonly az: V2) {}
  p(u: number, y: number, v: number): V3 { return { x: this.c.x + this.ax.x * u + this.az.x * v, y: this.y0 + y, z: this.c.z + this.ax.z * u + this.az.z * v }; }
  d(u: number, y: number, v: number): V3 { return { x: this.ax.x * u + this.az.x * v, y, z: this.ax.z * u + this.az.z * v }; }
}

/** Gevel met traveeën: u in "tegels" (1 tegel = 2 traveeën), v = 0,5 per verdieping. */
function gevel(mb: MeshBouwer, L: Lokaal, mat: string, u0: number, v0: number, u1: number, v1: number, y0: number, y1: number,
  laagVan: number, laagTot: number, buiten: V3, travee = 3) {
  const lengte = Math.hypot(u1 - u0, v1 - v0);
  if (!mat.startsWith('gevel:')) {
    // Muurwerk zonder ramen: UV gewoon in meters.
    mb.quad(mat, L.p(u0, y0, v0), L.p(u1, y0, v1), L.p(u1, y1, v1), L.p(u0, y1, v0), [0, y0], [lengte, y0], [lengte, y1], [0, y1], buiten);
    return;
  }
  const n = Math.max(1, Math.round(lengte / travee));
  mb.quad(mat, L.p(u0, y0, v0), L.p(u1, y0, v1), L.p(u1, y1, v1), L.p(u0, y1, v0), [0, laagVan * 0.5], [n / 2, laagVan * 0.5], [n / 2, laagTot * 0.5], [0, laagTot * 0.5], buiten);
}

/** Vier gevels rond de footprint. */
function gevelsRond(mb: MeshBouwer, L: Lokaal, B: number, D: number, y0: number, y1: number, laagVan: number, laagTot: number, voor: string, zij: string, travee = 3) {
  gevel(mb, L, voor, -B / 2, D / 2, B / 2, D / 2, y0, y1, laagVan, laagTot, L.d(0, 0, 1), travee);
  gevel(mb, L, zij, B / 2, -D / 2, -B / 2, -D / 2, y0, y1, laagVan, laagTot, L.d(0, 0, -1), travee);
  gevel(mb, L, zij, -B / 2, -D / 2, -B / 2, D / 2, y0, y1, laagVan, laagTot, L.d(-1, 0, 0), travee);
  gevel(mb, L, zij, B / 2, D / 2, B / 2, -D / 2, y0, y1, laagVan, laagTot, L.d(1, 0, 0), travee);
}

/** Doos in lokale coördinaten (u,v = midden). */
function doos(mb: MeshBouwer, L: Lokaal, zij: string, top: string, u: number, v: number, b: number, d: number, y0: number, y1: number, bodem = false) {
  mb.blok(zij, top, L.p(u, 0, v), L.d(1, 0, 0), L.d(0, 0, 1), b, d, L.y0 + y0, L.y0 + y1, bodem);
}

/** Dakrand (opstaande rand) rond een plat dak. */
function dakrand(mb: MeshBouwer, L: Lokaal, B: number, D: number, y: number, h = 0.6, dikte = 0.3, mat = 'trim') {
  doos(mb, L, mat, mat, 0, D / 2 - dikte / 2, B, dikte, y, y + h);
  doos(mb, L, mat, mat, 0, -D / 2 + dikte / 2, B, dikte, y, y + h);
  doos(mb, L, mat, mat, -B / 2 + dikte / 2, 0, dikte, D - 2 * dikte, y, y + h);
  doos(mb, L, mat, mat, B / 2 - dikte / 2, 0, dikte, D - 2 * dikte, y, y + h);
}

/** Maaiveld van de kavel, over het terrein gedrapeerd. */
function kavelGrond(mb: MeshBouwer, k: Perceel, mat: string, hoogte: H, a0 = 0, a1 = 1, b0 = 0, b1 = 1, dy = 0.05) {
  const [p0, p1, , p3] = k.poly;
  const na = Math.max(1, Math.ceil(k.breedte * (a1 - a0) / 4)), nb = Math.max(1, Math.ceil(k.diepte * (b1 - b0) / 4));
  const P = (a: number, b: number): V3 => {
    const x = p0.x + (p1.x - p0.x) * a + (p3.x - p0.x) * b, z = p0.z + (p1.z - p0.z) * a + (p3.z - p0.z) * b;
    return { x, y: hoogte(x, z) + dy, z };
  };
  for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) {
    const A0 = a0 + (a1 - a0) * i / na, A1 = a0 + (a1 - a0) * (i + 1) / na, B0 = b0 + (b1 - b0) * j / nb, B1 = b0 + (b1 - b0) * (j + 1) / nb;
    const q = [P(A0, B0), P(A1, B0), P(A1, B1), P(A0, B1)];
    mb.quad(mat, q[0], q[1], q[2], q[3], [q[0].x, q[0].z], [q[1].x, q[1].z], [q[2].x, q[2].z], [q[3].x, q[3].z], { x: 0, y: 1, z: 0 });
  }
}

function stijlVoor(g: Gebouw, r: Rng): GevelStijl {
  switch (g.vorm) {
    case 'rijwoningen': return r.kies(['baksteenRood', 'baksteenRood', 'baksteenBruin', 'baksteenGeel'] as const);
    case 'appartementen': return r.kies(['baksteenBruin', 'baksteenRood', 'stuc', 'modernDonker', 'baksteenGeel'] as const);
    case 'winkelsMetWonen': return r.kies(['baksteenRood', 'baksteenBruin', 'stuc', 'baksteenGeel'] as const);
    case 'kantoortoren': return r.kies(['vliesgevel', 'vliesgevel', 'betonband', 'modernDonker'] as const);
    default: return 'modernDonker';
  }
}

export function bouwGebouw(g: Gebouw, hoogte: H): { mesh: MeshData; props: Prop[] } {
  const mb = new MeshBouwer();
  const props: Prop[] = [];
  const r = new Rng(g.seed);
  const k = g.perceel;
  const az = g.voor, ax = { x: -az.z, z: az.x };
  const L = new Lokaal(g.centrum, g.y, ax, az);
  const B = g.breedte, D = g.diepte;
  const H = totaleHoogte(g.lagen);
  const stijl = stijlVoor(g, r);

  // Afstand van de voorgevel tot de voorkant van de kavel (= de stoep).
  const terug = (g.centrum.x - k.voor.x) * k.binnen.x + (g.centrum.z - k.voor.z) * k.binnen.z - D / 2;

  // Maaiveld en tuin.
  const grondMat = g.zone === 'industrie' ? 'erfverharding' : g.zone === 'kantoor' || g.zone === 'gemengd' ? 'stoeptegels' : 'tuin';
  kavelGrond(mb, k, grondMat, hoogte);

  if (!g.klaar) {
    bouwplaats(mb, L, g, k, hoogte, terug, props);
    return { mesh: mb.bouw(), props };
  }

  // Plint: van het laagste maaiveld tot het vloerpeil.
  const plintMat = stijl.startsWith('baksteen') ? 'plint' : 'beton';
  doos(mb, L, plintMat, plintMat, 0, 0, B + 0.1, D + 0.1, g.yGrond - g.y - 0.6, 0.02);

  switch (g.vorm) {
    case 'rijwoningen': rijwoningen(mb, L, g, k, r, stijl, terug, hoogte, props); break;
    case 'appartementen': appartementen(mb, L, g, r, stijl, terug, props); break;
    case 'winkelsMetWonen': winkels(mb, L, g, r, stijl); break;
    case 'kantoortoren': kantoor(mb, L, g, r, stijl, terug, props); break;
    case 'bedrijfshal': hal(mb, L, g, r, terug); break;
  }
  void H;
  return { mesh: mb.bouw(), props };
}

// ─── Rijwoningen ─────────────────────────────────────────────────────────────────

function rijwoningen(mb: MeshBouwer, L: Lokaal, g: Gebouw, k: Perceel, r: Rng, stijl: GevelStijl, terug: number, hoogte: H, props: Prop[]) {
  const B = g.breedte, D = g.diepte, n = g.eenheden, w = B / n;
  const H = totaleHoogte(g.lagen), lagen = g.lagen.length;
  const gevelMat = `gevel:${stijl}`, muurMat = `muur:${stijl}`;
  const plat = r.next() < 0.12;
  const dakMat = r.next() < 0.3 ? 'dakpannenAntraciet' : 'dakpannen';

  // Voor- en achtergevels per woning (2 traveeën per woning).
  for (let i = 0; i < n; i++) {
    const u0 = -B / 2 + i * w, u1 = u0 + w;
    gevel(mb, L, gevelMat, u0, D / 2, u1, D / 2, 0, H, 0, lagen, L.d(0, 0, 1), w / 2);
    gevel(mb, L, gevelMat, u1, -D / 2, u0, -D / 2, 0, H, 0, lagen, L.d(0, 0, -1), w / 2);
  }
  // Kopgevels.
  gevel(mb, L, muurMat, -B / 2, -D / 2, -B / 2, D / 2, 0, H, 0, lagen, L.d(-1, 0, 0));
  gevel(mb, L, muurMat, B / 2, D / 2, B / 2, -D / 2, 0, H, 0, lagen, L.d(1, 0, 0));

  if (plat) {
    mb.quad('dakgrind', L.p(-B / 2, H, D / 2), L.p(B / 2, H, D / 2), L.p(B / 2, H, -D / 2), L.p(-B / 2, H, -D / 2), [0, 0], [B, 0], [B, D], [0, D], L.d(0, 1, 0));
    dakrand(mb, L, B + 0.1, D + 0.1, H - 0.05, 0.45, 0.25);
  } else {
    // Zadeldak, nok evenwijdig aan de straat, 42°, met overstek.
    const ov = 0.4, helling = Math.tan(42 * Math.PI / 180);
    const nokY = H + (D / 2) * helling, randY = H - ov * helling;
    const u0 = -B / 2 - 0.25, u1 = B / 2 + 0.25;
    const lengteDak = Math.hypot(D / 2 + ov, nokY - randY);
    for (const kant of [1, -1]) {
      mb.quad(dakMat, L.p(u0, randY, kant * (D / 2 + ov)), L.p(u1, randY, kant * (D / 2 + ov)), L.p(u1, nokY, 0), L.p(u0, nokY, 0),
        [0, 0], [u1 - u0, 0], [u1 - u0, lengteDak], [0, lengteDak], L.d(0, 1, kant));
      // Onderkant overstek en witte boeiboord.
      mb.quad('trim', L.p(u0, randY, kant * (D / 2 + ov)), L.p(u1, randY, kant * (D / 2 + ov)), L.p(u1, H, kant * D / 2), L.p(u0, H, kant * D / 2), [0, 0], [1, 0], [1, 1], [0, 1], L.d(0, -1, 0));
      mb.quad('trim', L.p(u0, randY - 0.22, kant * (D / 2 + ov)), L.p(u1, randY - 0.22, kant * (D / 2 + ov)), L.p(u1, randY + 0.02, kant * (D / 2 + ov)), L.p(u0, randY + 0.02, kant * (D / 2 + ov)), [0, 0], [1, 0], [1, 1], [0, 1], L.d(0, 0, kant));
    }
    // Topgevels.
    for (const kant of [-1, 1]) {
      const u = kant * B / 2;
      mb.driehoek(muurMat, L.p(u, H, -D / 2), L.p(u, H, D / 2), L.p(u, nokY, 0), [0, H], [D, H], [D / 2, nokY], L.d(kant, 0, 0));
      // Windveren langs de dakrand van de kopgevel.
      for (const z of [1, -1]) {
        const a = L.p(u + kant * 0.25, randY, z * (D / 2 + ov)), b = L.p(u + kant * 0.25, nokY, 0);
        mb.quad('trim', a, b, { ...b, y: b.y + 0.22 }, { ...a, y: a.y + 0.22 }, [0, 0], [1, 0], [1, 1], [0, 1], L.d(kant, 0, 0));
      }
    }
    // Dakkapellen op een deel van de woningen.
    for (let i = 0; i < n; i++) {
      if (r.next() > 0.45) continue;
      const uc = -B / 2 + (i + 0.5) * w, bw = Math.min(2.6, w - 1.4);
      const vF = D / 2 - 1.6, hoogteDak = H + (D / 2 - vF) * helling;
      const top = hoogteDak + 1.5;
      const vAchter = D / 2 - (top - H) / helling;
      // Voorkant (raam in een witte lijst).
      mb.quad('trim', L.p(uc - bw / 2, hoogteDak, vF), L.p(uc + bw / 2, hoogteDak, vF), L.p(uc + bw / 2, top, vF), L.p(uc - bw / 2, top, vF), [0, 0], [1, 0], [1, 1], [0, 1], L.d(0, 0, 1));
      mb.quad('raam', L.p(uc - bw / 2 + 0.2, hoogteDak + 0.25, vF + 0.02), L.p(uc + bw / 2 - 0.2, hoogteDak + 0.25, vF + 0.02), L.p(uc + bw / 2 - 0.2, top - 0.2, vF + 0.02), L.p(uc - bw / 2 + 0.2, top - 0.2, vF + 0.02), [0, 0], [1, 0], [1, 1], [0, 1], L.d(0, 0, 1));
      for (const s of [-1, 1]) {
        const u = uc + s * bw / 2;
        mb.driehoek('trim', L.p(u, hoogteDak, vF), L.p(u, top, vF), L.p(u, top, vAchter), [0, 0], [0, 1], [1, 1], L.d(s, 0, 0));
      }
      mb.quad('dakgrind', L.p(uc - bw / 2 - 0.1, top, vF + 0.15), L.p(uc + bw / 2 + 0.1, top, vF + 0.15), L.p(uc + bw / 2 + 0.1, top, vAchter), L.p(uc - bw / 2 - 0.1, top, vAchter), [0, 0], [1, 0], [1, 1], [0, 1], L.d(0, 1, 0));
    }
    // Schoorstenen.
    for (let i = 0; i < n; i += 2) if (r.next() < 0.5) doos(mb, L, muurMat, 'trimDonker', -B / 2 + (i + 0.7) * w, -0.8, 0.6, 0.6, nokY - 1.2, nokY + 0.7);
  }

  // Voordeuren met kozijn, stoep en tuinpad; heg langs de voortuin; schuurtje achter.
  const deurU = r.next() < 0.5 ? 0.25 : 0.75;
  for (let i = 0; i < n; i++) {
    const u0 = -B / 2 + i * w;
    const spiegel = i % 2 === 1;
    const du = u0 + (spiegel ? 1 - deurU : deurU) * w;
    const v = D / 2 + 0.03;
    mb.quad('trim', L.p(du - 0.62, 0, v), L.p(du + 0.62, 0, v), L.p(du + 0.62, 2.55, v), L.p(du - 0.62, 2.55, v), [0, 0], [1, 0], [1, 1], [0, 1], L.d(0, 0, 1));
    const kleur = (g.seed + i * 7) % 5;
    mb.quad(`deur:${kleur}`, L.p(du - 0.5, 0, v + 0.02), L.p(du + 0.5, 0, v + 0.02), L.p(du + 0.5, 2.3, v + 0.02), L.p(du - 0.5, 2.3, v + 0.02), [0, 0], [1, 0], [1, 1], [0, 1], L.d(0, 0, 1));
    // Bovenlicht.
    mb.quad('raam', L.p(du - 0.5, 2.36, v + 0.02), L.p(du + 0.5, 2.36, v + 0.02), L.p(du + 0.5, 2.5, v + 0.02), L.p(du - 0.5, 2.5, v + 0.02), [0, 0], [1, 0], [1, 1], [0, 1], L.d(0, 0, 1));
    doos(mb, L, 'beton', 'beton', du, D / 2 + 0.4, 1.4, 0.8, -0.3, 0.02);
    // Tuinpad naar de stoep.
    if (terug > 0.6) {
      const a = L.p(du - 0.55, 0, D / 2 + 0.8), b = L.p(du + 0.55, 0, D / 2 + 0.8), c = L.p(du + 0.55, 0, D / 2 + terug), d = L.p(du - 0.55, 0, D / 2 + terug);
      for (const p of [a, b, c, d]) p.y = hoogte(p.x, p.z) + 0.08;
      mb.quad('stoeptegels', a, b, c, d, [a.x, a.z], [b.x, b.z], [c.x, c.z], [d.x, d.z], { x: 0, y: 1, z: 0 });
      // Heg tussen voortuinen, met een opening bij het pad.
      const hu = spiegel ? u0 + 0.15 : u0 + w - 0.15;
      if (i < n - 1 || spiegel) doos(mb, L, 'haag', 'haag', hu, D / 2 + 0.3 + (terug - 0.3) / 2, 0.5, terug - 0.6, hoogte(L.p(hu, 0, D / 2 + terug / 2).x, L.p(hu, 0, D / 2 + terug / 2).z) - g.y, hoogte(L.p(hu, 0, D / 2 + terug / 2).x, L.p(hu, 0, D / 2 + terug / 2).z) - g.y + 0.9);
    }
    // Achtertuin: schutting tussen de tuinen en een schuurtje.
    const achter = k.diepte - terug - D;
    if (achter > 4) {
      const vMid = -D / 2 - achter / 2;
      const yS = hoogte(L.p(u0, 0, vMid).x, L.p(u0, 0, vMid).z) - g.y;
      if (i > 0) doos(mb, L, 'hout', 'hout', u0, vMid, 0.06, achter - 0.4, yS, yS + 1.8);
      if (r.next() < 0.7) {
        const sv = -D / 2 - achter + 1.6;
        const ys = hoogte(L.p(u0 + w / 2, 0, sv).x, L.p(u0 + w / 2, 0, sv).z) - g.y;
        doos(mb, L, 'hout', 'dakgrind', u0 + w / 2, sv, Math.min(2.4, w - 1), 2.2, ys, ys + 2.3);
      }
      if (r.next() < 0.35) {
        const p = L.p(u0 + w * r.range(0.3, 0.7), 0, -D / 2 - achter * r.range(0.3, 0.6));
        props.push({ soort: r.kies(['berk', 'eik', 'linde'] as const), x: p.x, y: hoogte(p.x, p.z), z: p.z, rot: r.range(0, 6.28), schaal: r.range(0.45, 0.7), variant: r.int(0, 1) });
      }
    }
  }
}

// ─── Appartementen ───────────────────────────────────────────────────────────────

function appartementen(mb: MeshBouwer, L: Lokaal, g: Gebouw, r: Rng, stijl: GevelStijl, terug: number, props: Prop[]) {
  const B = g.breedte, D = g.diepte, lagen = g.lagen.length, H = totaleHoogte(g.lagen);
  gevelsRond(mb, L, B, D, 0, H, 0, lagen, `gevel:${stijl}`, `gevel:${stijl}`);
  mb.quad('dakgrind', L.p(-B / 2, H, D / 2), L.p(B / 2, H, D / 2), L.p(B / 2, H, -D / 2), L.p(-B / 2, H, -D / 2), [0, 0], [B, 0], [B, D], [0, D], L.d(0, 1, 0));
  dakrand(mb, L, B + 0.15, D + 0.15, H - 0.1, 0.8, 0.35, stijl === 'modernDonker' ? 'trimDonker' : 'trim');
  // Trappenhuis en installaties op het dak.
  doos(mb, L, `muur:${stijl}`, 'dakgrind', -B / 4, -D / 6, 3.2, 4.5, H, H + 3.0);
  doos(mb, L, 'metaal', 'metaal', B / 4, 0, 2.2, 1.6, H, H + 1.3);
  if (B > 14) doos(mb, L, 'metaal', 'metaal', B / 4 + 3, -1, 1.4, 1.4, H, H + 1.0);

  // Balkons aan de voorkant per travee-paar, vanaf de eerste verdieping.
  const glas = r.next() < 0.5;
  const n = Math.max(1, Math.round(B / 6));
  const bw = B / n;
  let y = g.lagen[0].hoogte;
  for (let l = 1; l < lagen; l++) {
    for (let i = 0; i < n; i++) {
      const uc = -B / 2 + (i + 0.5) * bw;
      const bb = Math.min(4.2, bw - 1.2);
      doos(mb, L, 'beton', 'beton', uc, D / 2 + 0.75, bb, 1.5, y - 0.2, y);
      const v = D / 2 + 1.5;
      const hek = glas ? 'glas' : 'metaal';
      mb.quad(hek, L.p(uc - bb / 2, y, v), L.p(uc + bb / 2, y, v), L.p(uc + bb / 2, y + 1.05, v), L.p(uc - bb / 2, y + 1.05, v), [0, 0], [1, 0], [1, 1], [0, 1], L.d(0, 0, 1));
      for (const s of [-1, 1]) mb.quad(hek, L.p(uc + s * bb / 2, y, D / 2), L.p(uc + s * bb / 2, y, v), L.p(uc + s * bb / 2, y + 1.05, v), L.p(uc + s * bb / 2, y + 1.05, D / 2), [0, 0], [1, 0], [1, 1], [0, 1], L.d(s, 0, 0));
      doos(mb, L, 'metaal', 'metaal', uc, v - 0.03, bb, 0.06, y + 1.0, y + 1.08);
    }
    y += g.lagen[l].hoogte;
  }
  // Entree met luifel.
  mb.quad('glas', L.p(-1.4, 0, D / 2 + 0.03), L.p(1.4, 0, D / 2 + 0.03), L.p(1.4, 2.7, D / 2 + 0.03), L.p(-1.4, 2.7, D / 2 + 0.03), [0, 0], [1, 0], [1, 1], [0, 1], L.d(0, 0, 1));
  doos(mb, L, 'trimDonker', 'trimDonker', 0, D / 2 + 1.0, 4, 2.0, 2.85, 3.05);
  // Fietsenstalling en bomen op het voorplein.
  if (terug > 3) {
    const p = L.p(B / 2 - 2, 0, D / 2 + terug / 2);
    props.push({ soort: 'linde', x: p.x, y: L.y0 - 0.1, z: p.z, rot: r.range(0, 6), schaal: 0.7, variant: r.int(0, 1) });
  }
}

// ─── Winkels met wonen ───────────────────────────────────────────────────────────

function winkels(mb: MeshBouwer, L: Lokaal, g: Gebouw, r: Rng, stijl: GevelStijl) {
  const B = g.breedte, D = g.diepte, lagen = g.lagen.length, H = totaleHoogte(g.lagen);
  const hBG = g.lagen[0].hoogte;
  // Winkelpuien op de begane grond, per ~6 m één pui.
  const n = Math.max(1, Math.round(B / 6)), pw = B / n;
  for (let i = 0; i < n; i++) {
    const u0 = -B / 2 + i * pw, pui = r.int(0, PUIEN - 1);
    mb.quad(`winkelpui:${pui}`, L.p(u0, 0, D / 2), L.p(u0 + pw, 0, D / 2), L.p(u0 + pw, hBG, D / 2), L.p(u0, hBG, D / 2), [0, 0], [1, 0], [1, 1], [0, 1], L.d(0, 0, 1));
    // Uitklapbare luifel met strepen.
    if (r.next() < 0.7) {
      const l = r.int(0, LUIFELS - 1), yl = hBG - 0.55;
      mb.quad(`luifel:${l}`, L.p(u0 + 0.3, yl, D / 2), L.p(u0 + pw - 0.3, yl, D / 2), L.p(u0 + pw - 0.3, yl - 0.75, D / 2 + 1.6), L.p(u0 + 0.3, yl - 0.75, D / 2 + 1.6), [0, 0], [pw - 0.6, 0], [pw - 0.6, 1], [0, 1], L.d(0, 1, 1));
      mb.quad(`luifel:${l}`, L.p(u0 + 0.3, yl - 0.75, D / 2 + 1.6), L.p(u0 + pw - 0.3, yl - 0.75, D / 2 + 1.6), L.p(u0 + pw - 0.3, yl - 1.0, D / 2 + 1.6), L.p(u0 + 0.3, yl - 1.0, D / 2 + 1.6), [0, 0], [pw - 0.6, 0], [pw - 0.6, 0.3], [0, 0.3], L.d(0, 0, 1));
    }
  }
  // Bovenverdiepingen.
  gevel(mb, L, `gevel:${stijl}`, -B / 2, D / 2, B / 2, D / 2, hBG, H, 0, lagen - 1, L.d(0, 0, 1));
  gevel(mb, L, `gevel:${stijl}`, B / 2, -D / 2, -B / 2, -D / 2, 0, H, 0, lagen, L.d(0, 0, -1));
  gevel(mb, L, `muur:${stijl}`, -B / 2, -D / 2, -B / 2, D / 2, 0, H, 0, lagen, L.d(-1, 0, 0));
  gevel(mb, L, `muur:${stijl}`, B / 2, D / 2, B / 2, -D / 2, 0, H, 0, lagen, L.d(1, 0, 0));
  // Lijst tussen winkel en wonen, kroonlijst bovenaan.
  doos(mb, L, 'trim', 'trim', 0, D / 2 + 0.12, B, 0.3, hBG, hBG + 0.35);
  mb.quad('dakgrind', L.p(-B / 2, H, D / 2), L.p(B / 2, H, D / 2), L.p(B / 2, H, -D / 2), L.p(-B / 2, H, -D / 2), [0, 0], [B, 0], [B, D], [0, D], L.d(0, 1, 0));
  dakrand(mb, L, B + 0.1, D + 0.1, H - 0.05, 0.9, 0.3, `muur:${stijl}`);
  doos(mb, L, 'trim', 'trim', 0, D / 2 + 0.2, B + 0.3, 0.45, H + 0.7, H + 1.0);
}

// ─── Kantoortoren ────────────────────────────────────────────────────────────────

function kantoor(mb: MeshBouwer, L: Lokaal, g: Gebouw, r: Rng, stijl: GevelStijl, terug: number, props: Prop[]) {
  const B = g.breedte, D = g.diepte, lagen = g.lagen.length, H = totaleHoogte(g.lagen);
  const hBG = g.lagen[0].hoogte;
  // Lobby van glas, iets terugliggend onder een overstek.
  doos(mb, L, 'glas', 'beton', 0, -0.6, B - 1.2, D - 1.2, 0, hBG);
  for (const [u, v] of [[-B / 2 + 0.4, D / 2 - 0.4], [B / 2 - 0.4, D / 2 - 0.4], [-B / 2 + 0.4, -D / 2 + 0.4], [B / 2 - 0.4, -D / 2 + 0.4]])
    doos(mb, L, 'beton', 'beton', u, v, 0.6, 0.6, 0, hBG);
  doos(mb, L, 'beton', 'beton', 0, 0, B, D, hBG - 0.35, hBG, true);
  gevelsRond(mb, L, B, D, hBG, H, 0, lagen - 1, `gevel:${stijl}`, `gevel:${stijl}`, stijl === 'vliesgevel' ? 3.6 : 3);
  mb.quad('dakgrind', L.p(-B / 2, H, D / 2), L.p(B / 2, H, D / 2), L.p(B / 2, H, -D / 2), L.p(-B / 2, H, -D / 2), [0, 0], [B, 0], [B, D], [0, D], L.d(0, 1, 0));
  dakrand(mb, L, B + 0.2, D + 0.2, H - 0.1, 1.1, 0.35, stijl === 'vliesgevel' ? 'metaal' : 'trimDonker');
  // Installaties op het dak.
  doos(mb, L, 'metaal', 'metaal', 0, 0, B * 0.5, D * 0.4, H, H + 2.6);
  doos(mb, L, 'metaal', 'metaal', B * 0.3, D * 0.25, 1.8, 1.8, H, H + 1.6);
  if (r.next() < 0.5) doos(mb, L, 'beton', 'beton', -B * 0.3, -D * 0.25, 2.5, 2.5, H, H + 4);
  // Entreeluifel.
  doos(mb, L, 'metaal', 'metaal', 0, D / 2 + 1.4, Math.min(8, B * 0.6), 2.8, hBG - 0.6, hBG - 0.35);
  if (terug > 3) for (const s of [-1, 1]) {
    const p = L.p(s * (B / 2 - 1.5), 0, D / 2 + terug * 0.6);
    props.push({ soort: 'plataan', x: p.x, y: L.y0 - 0.1, z: p.z, rot: r.range(0, 6), schaal: 0.75, variant: r.int(0, 1) });
  }
}

// ─── Bedrijfshal ─────────────────────────────────────────────────────────────────

function hal(mb: MeshBouwer, L: Lokaal, g: Gebouw, r: Rng, terug: number) {
  const B = g.breedte, D = g.diepte, H = totaleHoogte(g.lagen);
  const tint = r.int(0, HALTINTEN - 1);
  const muur = `golfplaat:${tint}`;
  const nok = H + (B / 2) * Math.tan(5 * Math.PI / 180);
  // Wanden (golfplaat loopt verticaal: u in meters).
  for (const [a, b, n] of [[[-B / 2, D / 2], [B / 2, D / 2], [0, 1]], [[B / 2, -D / 2], [-B / 2, -D / 2], [0, -1]], [[-B / 2, -D / 2], [-B / 2, D / 2], [-1, 0]], [[B / 2, D / 2], [B / 2, -D / 2], [1, 0]]] as [number[], number[], number[]][]) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    mb.quad(muur, L.p(a[0], 0, a[1]), L.p(b[0], 0, b[1]), L.p(b[0], H, b[1]), L.p(a[0], H, a[1]), [0, 0], [len, 0], [len, H], [0, H], L.d(n[0], 0, n[1]));
  }
  // Puntgevels van het flauwe dak (langs u).
  for (const s of [1, -1]) mb.driehoek(muur, L.p(-B / 2, H, s * D / 2), L.p(B / 2, H, s * D / 2), L.p(0, nok, s * D / 2), [0, H], [B, H], [B / 2, nok], L.d(0, 0, s));
  // Dak met lichtstraten.
  for (const s of [-1, 1]) {
    mb.quad('golfdak', L.p(s * (B / 2 + 0.3), H - 0.03, -D / 2 - 0.3), L.p(s * (B / 2 + 0.3), H - 0.03, D / 2 + 0.3), L.p(0, nok, D / 2 + 0.3), L.p(0, nok, -D / 2 - 0.3), [0, 0], [D + 0.6, 0], [D + 0.6, B / 2], [0, B / 2], L.d(s, 4, 0));
    for (let v = -D / 2 + 4; v < D / 2 - 3; v += 7) {
      const u0 = s * B * 0.12, u1 = s * B * 0.32;
      const y0 = H + (B / 2 - Math.abs(u0)) * Math.tan(5 * Math.PI / 180) + 0.05, y1 = H + (B / 2 - Math.abs(u1)) * Math.tan(5 * Math.PI / 180) + 0.05;
      mb.quad('lichtstraat', L.p(u0, y0, v), L.p(u1, y1, v), L.p(u1, y1, v + 2.5), L.p(u0, y0, v + 2.5), [0, 0], [1, 0], [1, 1], [0, 1], L.d(s * 0.1, 1, 0));
    }
  }
  // Dakrand en hoekprofielen.
  for (const [u, v] of [[-B / 2, -D / 2], [B / 2, -D / 2], [-B / 2, D / 2], [B / 2, D / 2]]) doos(mb, L, 'trimDonker', 'trimDonker', u, v, 0.25, 0.25, 0, H + 0.05);
  // Laaddeuren aan de voorkant met luifels.
  const deuren = Math.max(1, Math.floor((B - 8) / 5.5));
  for (let i = 0; i < deuren; i++) {
    const uc = -B / 2 + 9 + i * 5.5;
    if (uc + 2 > B / 2) break;
    mb.quad('roldeur', L.p(uc - 1.8, 0, D / 2 + 0.03), L.p(uc + 1.8, 0, D / 2 + 0.03), L.p(uc + 1.8, 4.2, D / 2 + 0.03), L.p(uc - 1.8, 4.2, D / 2 + 0.03), [0, 0], [3.6, 0], [3.6, 4.2], [0, 4.2], L.d(0, 0, 1));
    doos(mb, L, 'beton', 'beton', uc, D / 2 + 1.2, 3.8, 2.4, -0.2, 1.1);
    doos(mb, L, 'trimDonker', 'trimDonker', uc, D / 2 + 1.0, 4.4, 2.0, 4.8, 5.0);
  }
  // Kantoorkop van twee verdiepingen aan de straatkant.
  const kb = Math.min(7.5, B * 0.35);
  doos(mb, L, 'muur:modernDonker', 'dakgrind', -B / 2 + kb / 2, D / 2 - 2.7, kb, 6, 0, 7.2);
  gevel(mb, L, 'gevel:modernDonker', -B / 2, D / 2 + 0.32, -B / 2 + kb, D / 2 + 0.32, 0, 7.2, 0, 2, L.d(0, 0, 1));
  doos(mb, L, 'trimDonker', 'trimDonker', -B / 2 + kb / 2, D / 2 - 2.7, kb + 0.2, 6.2, 7.2, 7.6);
  void terug;
}

// ─── Bouwplaats ──────────────────────────────────────────────────────────────────

function bouwplaats(mb: MeshBouwer, L: Lokaal, g: Gebouw, k: Perceel, hoogte: H, terug: number, props: Prop[]) {
  const B = g.breedte, D = g.diepte, lagen = g.lagen.length;
  const klaarLagen = Math.min(lagen, Math.floor(g.voortgang * lagen * 1.05));
  const H = totaleHoogte(g.lagen);
  // Bouwput / fundering.
  doos(mb, L, 'beton', 'beton', 0, 0, B, D, g.yGrond - g.y - 0.4, 0.02);
  let y = 0;
  for (let l = 0; l < klaarLagen; l++) {
    const h = g.lagen[l].hoogte;
    // Vloer en kolommen (casco).
    doos(mb, L, 'beton', 'beton', 0, 0, B, D, y + h - 0.3, y + h);
    const nu = Math.max(2, Math.round(B / 5)), nv = Math.max(2, Math.round(D / 5));
    for (let i = 0; i <= nu; i++) for (const v of [-D / 2 + 0.2, D / 2 - 0.2]) doos(mb, L, 'beton', 'beton', -B / 2 + 0.2 + (B - 0.4) * i / nu, v, 0.35, 0.35, y, y + h - 0.3);
    for (let j = 1; j < nv; j++) for (const u of [-B / 2 + 0.2, B / 2 - 0.2]) doos(mb, L, 'beton', 'beton', u, -D / 2 + 0.2 + (D - 0.4) * j / nv, 0.35, 0.35, y, y + h - 0.3);
    y += h;
  }
  // Steigers rondom tot net boven de huidige hoogte.
  const st = Math.max(2.5, y + 1.2);
  for (const [a, b, n] of [[[-B / 2 - 1.2, D / 2 + 1.2], [B / 2 + 1.2, D / 2 + 1.2], [0, 1]], [[B / 2 + 1.2, -D / 2 - 1.2], [-B / 2 - 1.2, -D / 2 - 1.2], [0, -1]], [[-B / 2 - 1.2, -D / 2 - 1.2], [-B / 2 - 1.2, D / 2 + 1.2], [-1, 0]], [[B / 2 + 1.2, D / 2 + 1.2], [B / 2 + 1.2, -D / 2 - 1.2], [1, 0]]] as [number[], number[], number[]][]) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    mb.quad('steiger', L.p(a[0], 0, a[1]), L.p(b[0], 0, b[1]), L.p(b[0], st, b[1]), L.p(a[0], st, a[1]), [0, 0], [len, 0], [len, st], [0, st], L.d(n[0], 0, n[1]));
  }
  // Bouwhek langs de straat.
  const hv = D / 2 + Math.max(0.5, terug - 0.4);
  const hekA = L.p(-k.breedte / 2 + 0.3, 0, hv), hekB = L.p(k.breedte / 2 - 0.3, 0, hv);
  const ya = hoogte(hekA.x, hekA.z) - g.y, yb = hoogte(hekB.x, hekB.z) - g.y;
  mb.quad('hekwerk', L.p(-k.breedte / 2 + 0.3, ya, hv), L.p(k.breedte / 2 - 0.3, yb, hv), L.p(k.breedte / 2 - 0.3, yb + 2, hv), L.p(-k.breedte / 2 + 0.3, ya + 2, hv), [0, 0], [k.breedte, 0], [k.breedte, 2], [0, 2], L.d(0, 0, 1));
  // Bouwkeet en materiaal.
  doos(mb, L, 'keet', 'trimDonker', B / 2 - 2, D / 2 + Math.min(terug, 4) / 2, 6, 2.4, 0, 2.6);
  // Torenkraan bij hogere gebouwen.
  if (H > 11) {
    const mu = -B / 2 - 3.5, mv = -D / 2 + 3;
    const top = H + 9;
    doos(mb, L, 'kraan', 'kraan', mu, mv, 1.6, 1.6, 0, top);
    const hoek = (g.seed % 628) / 100;
    const ca = Math.cos(hoek), sa = Math.sin(hoek);
    const giek = (lengte: number, breed: number, y0: number, y1: number) => {
      const c = { u: mu + ca * lengte / 2, v: mv + sa * lengte / 2 };
      mb.blok('kraan', 'kraan', L.p(c.u, 0, c.v), L.d(ca, 0, sa), L.d(-sa, 0, ca), lengte, breed, L.y0 + y0, L.y0 + y1);
    };
    giek(34, 1.1, top, top + 1.4);
    giek(-12, 1.4, top, top + 1.0);
    doos(mb, L, 'beton', 'beton', mu - ca * 10, mv - sa * 10, 2.5, 2.5, top - 2.2, top);
    doos(mb, L, 'kraan', 'kraan', mu, mv, 1.2, 1.2, top + 1.4, top + 5);
    doos(mb, L, 'glas', 'kraan', mu + ca * 1.8, mv + sa * 1.8, 1.8, 1.8, top - 2.2, top);
  }
  void props;
}
