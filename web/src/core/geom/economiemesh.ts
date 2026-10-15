import { V2, V3 } from '../math';
import { Rng } from '../rng';
import { MeshBouwer, MeshData, Prop } from './mesh';
import { cilinder } from './props';
import { Bedrijf, Gebied } from '../economie';
import { driehoeken, verfijn, getekendOppervlak } from '../poly';

type H = (x: number, z: number) => number;
const OP: V3 = { x: 0, y: 1, z: 0 };

/** Gedrapeerd vlak; UV in meters langs een as (voor rijen in een akker). */
function gedrapeerd(mb: MeshBouwer, mat: string, poly: V2[], hoogte: H, dy: number, as: V2 = { x: 1, z: 0 }, max = 8) {
  const v = verfijn(poly, driehoeken(poly), max);
  const uv = (p: V2): [number, number] => [p.x * as.x + p.z * as.z, -p.x * as.z + p.z * as.x];
  for (let i = 0; i < v.tri.length; i += 3) {
    const [a, b, c] = [v.p[v.tri[i]], v.p[v.tri[i + 1]], v.p[v.tri[i + 2]]];
    mb.driehoek(mat, { x: a.x, y: hoogte(a.x, a.z) + dy, z: a.z }, { x: b.x, y: hoogte(b.x, b.z) + dy, z: b.z }, { x: c.x, y: hoogte(c.x, c.z) + dy, z: c.z }, uv(a), uv(b), uv(c), OP);
  }
}

/** Akkers met gewassen en sloten ertussen. */
export function bouwVelden(g: Gebied, hoogte: H): MeshData {
  const mb = new MeshBouwer();
  for (const v of g.velden) {
    if (!v.bedrijf) continue;
    gedrapeerd(mb, `gewas:${v.gewas}`, v.poly, hoogte, 0.14, v.as, 3.5);
    // Sloten langs de lange randen.
    const A = getekendOppervlak(v.poly);
    for (let i = 0; i < v.poly.length; i++) {
      const a = v.poly[i], b = v.poly[(i + 1) % v.poly.length];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 60) continue;
      const t = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
      const n = A > 0 ? { x: t.z, z: -t.x } : { x: -t.z, z: t.x };
      const q = [a, b, { x: b.x + n.x * 1.4, z: b.z + n.z * 1.4 }, { x: a.x + n.x * 1.4, z: a.z + n.z * 1.4 }];
      gedrapeerd(mb, 'sloot', q, hoogte, 0.03, t, 20);
    }
  }
  return mb.bouw();
}

const P3 = (p: V2, y: number): V3 => ({ x: p.x, y, z: p.z });

/** Lokaal assenstelsel van het erf: v wijst naar de weg. */
function frame(b: Bedrijf) {
  const v = { x: Math.sin(b.rot), z: Math.cos(b.rot) }, u = { x: v.z, z: -v.x };
  const p = (a: number, c: number): V2 => ({ x: b.p.x + u.x * a + v.x * c, z: b.p.z + u.z * a + v.z * c });
  return { u, v, p };
}

function doos(mb: MeshBouwer, zij: string, top: string, c: V2, t: V2, br: number, d: number, y0: number, y1: number) {
  mb.blok(zij, top, { x: c.x, y: 0, z: c.z }, { x: t.x, y: 0, z: t.z }, { x: -t.z, y: 0, z: t.x }, br, d, y0, y1);
}

/** Zadeldak boven een rechthoek (nok langs t). */
function zadeldak(mb: MeshBouwer, mat: string, gevel: string, c: V2, t: V2, lengte: number, breedte: number, y: number, nok: number, overstek = 0.6) {
  const n = { x: -t.z, z: t.x };
  const P = (a: number, b: number, h: number) => P3({ x: c.x + t.x * a + n.x * b, z: c.z + t.z * a + n.z * b }, h);
  const L = lengte / 2 + overstek, B = breedte / 2 + overstek;
  const rand = y - overstek * (nok - y) / (breedte / 2);
  for (const s of [1, -1]) {
    mb.quad(mat, P(-L, s * B, rand), P(L, s * B, rand), P(L, 0, nok), P(-L, 0, nok), [0, 0], [lengte, 0], [lengte, B * 1.3], [0, B * 1.3], { x: n.x * s, y: 1.5, z: n.z * s });
    mb.driehoek(gevel, P(s * lengte / 2, -breedte / 2, y), P(s * lengte / 2, breedte / 2, y), P(s * lengte / 2, 0, nok), [0, y], [breedte, y], [breedte / 2, nok], { x: t.x * s, y: 0, z: t.z * s });
  }
}

export function bouwBedrijf(b: Bedrijf, g: Gebied, hoogte: H): { mesh: MeshData; props: Prop[] } {
  const mb = new MeshBouwer();
  const props: Prop[] = [];
  const r = new Rng(b.seed);
  const { u, v, p } = frame(b);
  const Y = hoogte(b.p.x, b.p.z) + 0.1;
  const erf = (w: number, d: number, mat = 'erfverharding') => gedrapeerd(mb, mat, [p(-w / 2, -d / 2), p(w / 2, -d / 2), p(w / 2, d / 2), p(-w / 2, d / 2)], hoogte, 0.08, u);

  if (!b.klaar) {
    erf(40, 34, 'erfverharding');
    doos(mb, 'keet', 'trimDonker', p(10, 8), u, 6, 2.4, Y, Y + 2.6);
    mb.quad('hekwerk', P3(p(-20, 17), Y), P3(p(20, 17), Y), P3(p(20, 17), Y + 2), P3(p(-20, 17), Y + 2), [0, 0], [40 / 3.5, 0], [40 / 3.5, 1], [0, 1], { x: v.x, y: 0, z: v.z });
    return { mesh: mb.bouw(), props };
  }

  switch (b.soort) {
    case 'landbouw': {
      erf(46, 40);
      // Langgevelboerderij: woonhuis voor, grote schuur erachter, één doorlopend rieten/pannen dak.
      const stijl = r.kies(['baksteenRood', 'baksteenBruin']);
      const huis = p(-6, 6), schuur = p(-6, -12);
      doos(mb, `muur:${stijl}`, 'trim', huis, v, 11, 10, Y - 0.4, Y + 3.2);
      doos(mb, `muur:${stijl}`, 'trim', schuur, v, 26, 16, Y - 0.4, Y + 3.6);
      zadeldak(mb, r.next() < 0.5 ? 'dakpannen' : 'dakpannenAntraciet', `muur:${stijl}`, huis, v, 11, 10, Y + 3.2, Y + 9);
      zadeldak(mb, 'dakpannenAntraciet', `muur:${stijl}`, schuur, v, 26, 16, Y + 3.6, Y + 12);
      // Ramen en deur van het woonhuis.
      const voorHuis = p(-6, 11.02);
      mb.quad('gevel:baksteenRood', P3({ x: voorHuis.x - u.x * 4, z: voorHuis.z - u.z * 4 }, Y), P3({ x: voorHuis.x + u.x * 4, z: voorHuis.z + u.z * 4 }, Y), P3({ x: voorHuis.x + u.x * 4, z: voorHuis.z + u.z * 4 }, Y + 3), P3({ x: voorHuis.x - u.x * 4, z: voorHuis.z - u.z * 4 }, Y + 3), [0, 0], [1, 0], [1, 0.5], [0, 0.5], { x: v.x, y: 0, z: v.z });
      // Schuurdeuren.
      const achter = p(-6, -20.05);
      mb.quad('hout', P3({ x: achter.x - u.x * 2.5, z: achter.z - u.z * 2.5 }, Y), P3({ x: achter.x + u.x * 2.5, z: achter.z + u.z * 2.5 }, Y), P3({ x: achter.x + u.x * 2.5, z: achter.z + u.z * 2.5 }, Y + 4.2), P3({ x: achter.x - u.x * 2.5, z: achter.z - u.z * 2.5 }, Y + 4.2), [0, 0], [5, 0], [5, 4.2], [0, 4.2], { x: -v.x, y: 0, z: -v.z });
      // Silo's en een loods.
      const silo = p(12, -8);
      cilinder(mb, 'silo', P3(silo, Y - 0.3), P3(silo, Y + 13), 2.4, 2.4, 14);
      cilinder(mb, 'silo', P3(silo, Y + 13), P3(silo, Y + 14.6), 2.4, 0.3, 14);
      const silo2 = p(17, -8);
      cilinder(mb, 'silo', P3(silo2, Y - 0.3), P3(silo2, Y + 10), 2, 2, 14);
      doos(mb, 'golfplaat:2', 'golfdak', p(14, 8), u, 14, 10, Y - 0.3, Y + 5.5);
      props.push({ soort: 'linde', x: p(-14, 16).x, y: Y, z: p(-14, 16).z, rot: 1, schaal: 0.9, variant: 0 });
      props.push({ soort: 'eik', x: p(-18, -2).x, y: Y, z: p(-18, -2).z, rot: 2, schaal: 1, variant: 1 });
      break;
    }
    case 'bosbouw': {
      erf(60, 44, 'erfverharding');
      doos(mb, 'golfplaat:2', 'golfdak', p(-14, -10), u, 22, 14, Y - 0.3, Y + 7);
      // Stapels boomstammen.
      for (let i = 0; i < 6; i++) {
        const c = p(-2 + (i % 3) * 9, 8 + Math.floor(i / 3) * 7);
        for (let laag = 0; laag < 3; laag++) for (let k = 0; k < 5 - laag; k++) {
          const off = (k - (4 - laag) / 2) * 0.9;
          const a = { x: c.x + v.x * off - u.x * 3.5, z: c.z + v.z * off - u.z * 3.5 }, e = { x: c.x + v.x * off + u.x * 3.5, z: c.z + v.z * off + u.z * 3.5 };
          cilinder(mb, 'schors', P3(a, Y + 0.45 + laag * 0.78), P3(e, Y + 0.45 + laag * 0.78), 0.42, 0.4, 6);
        }
      }
      doos(mb, 'hout', 'hout', p(18, -12), u, 8, 4, Y, Y + 2.5);
      break;
    }
    case 'olie': {
      erf(40, 36, 'erfverharding');
      for (let i = 0; i < 3; i++) {
        const c = p(-12 + i * 11, -6);
        cilinder(mb, 'tank', P3(c, Y - 0.2), P3(c, Y + 8), 4.5, 4.5, 18);
        cilinder(mb, 'tank', P3(c, Y + 8), P3(c, Y + 8.8), 4.5, 0.5, 18);
      }
      doos(mb, 'keet', 'trimDonker', p(12, 10), u, 8, 4, Y, Y + 3);
      mb.quad('hekwerk', P3(p(-20, 18), Y), P3(p(20, 18), Y), P3(p(20, 18), Y + 2), P3(p(-20, 18), Y + 2), [0, 0], [40 / 3.5, 0], [40 / 3.5, 1], [0, 1], { x: v.x, y: 0, z: v.z });
      for (const q of b.putten) {
        gedrapeerd(mb, 'erfverharding', [{ x: q.x - 7, z: q.z - 4 }, { x: q.x + 7, z: q.z - 4 }, { x: q.x + 7, z: q.z + 4 }, { x: q.x - 7, z: q.z + 4 }], hoogte, 0.08);
        props.push({ soort: 'jaknikker', x: q.x, y: hoogte(q.x, q.z) + 0.1, z: q.z, rot: r.range(0, 6.28), schaal: 1, variant: 0 });
      }
      break;
    }
    case 'delfstoffen': {
      erf(56, 44, 'erfverharding');
      // Breker met een schuine transportband en zand- en grindbergen.
      doos(mb, 'golfplaat:0', 'golfdak', p(-12, -6), u, 12, 10, Y - 0.3, Y + 11);
      const b0 = p(-6, -6), b1 = p(16, 10);
      const L = Math.hypot(b1.x - b0.x, b1.z - b0.z), dir = { x: (b1.x - b0.x) / L, z: (b1.z - b0.z) / L };
      mb.blok('metaal', 'metaal', { x: (b0.x + b1.x) / 2, y: 0, z: (b0.z + b1.z) / 2 }, { x: dir.x, y: 0, z: dir.z }, { x: -dir.z, y: 0, z: dir.x }, L, 1.4, Y + 5.5, Y + 6.1);
      for (const [a, c, rr, h, mat] of [[14, 10, 9, 7, 'zandberg'], [2, 14, 7, 5, 'grind'], [20, -10, 8, 6, 'zandberg']] as [number, number, number, number, string][]) {
        const m = p(a, c);
        cilinder(mb, mat, P3(m, Y - 0.2), P3(m, Y + h), rr, 0.3, 16);
      }
      // Plas onder in de put.
      const put = b.putten[0];
      if (put) {
        const y = hoogte(put.x, put.z) + 0.6;
        const pts: V2[] = [];
        for (let i = 0; i < 24; i++) { const h = i / 24 * Math.PI * 2; pts.push({ x: put.x + Math.cos(h) * 22, z: put.z + Math.sin(h) * 22 }); }
        const tri = driehoeken(pts);
        for (let i = 0; i < tri.length; i += 3) mb.driehoek('plas', P3(pts[tri[i]], y), P3(pts[tri[i + 1]], y), P3(pts[tri[i + 2]], y), [pts[tri[i]].x, pts[tri[i]].z], [pts[tri[i + 1]].x, pts[tri[i + 1]].z], [pts[tri[i + 2]].x, pts[tri[i + 2]].z], OP);
        // Zandzuiger op de plas.
        doos(mb, 'kraan', 'kraan', { x: put.x + 6, z: put.z }, u, 6, 3, y - 0.2, y + 1.6);
      }
      break;
    }
  }
  void g;
  return { mesh: mb.bouw(), props };
}
