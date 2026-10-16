import { V2, V3 } from '../math';
import { Rng } from '../rng';
import { MeshBouwer, MeshData, Prop } from './mesh';
import { cilinder } from './props';
import { Bedrijf, Gebied } from '../economie';
import { driehoeken, verfijn, getekendOppervlak } from '../poly';
import { gebouwBlok, trekker, hooibaal, tank, leidingbrug, container, dakkasten } from './detail';

type H = (x: number, z: number) => number;
const OP: V3 = { x: 0, y: 1, z: 0 };

/** Gedrapeerd vlak; UV in meters langs een as (voor rijen in een akker). */
function gedrapeerd(mb: MeshBouwer, mat: string, poly: V2[], hoogte: H, dy: number, as: V2 = { x: 1, z: 0 }, max = 8) {
  const v = verfijn(poly, driehoeken(poly), max, hoogte);
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
      // Langgevelboerderij: woonhuis met ramen en voordeur, grote schuur met inrijdeuren, stal met
      // lichtnok, sleufsilo met kuil onder plastic en banden, silo's, werktuigenloods met trekker.
      const stijl = r.kies(['baksteenRood', 'baksteenBruin']);
      const huis = p(-6, 6), schuur = p(-6, -12);
      gebouwBlok(mb, huis, u, 11, 10, Y - 0.4, Y + 3.2, `gevel:${stijl}`, { randH: 0.01, rand: 'trim' });
      doos(mb, `muur:${stijl}`, 'trim', schuur, v, 26, 16, Y - 0.4, Y + 3.6);
      zadeldak(mb, r.next() < 0.5 ? 'dakpannen' : 'dakpannenAntraciet', `muur:${stijl}`, huis, v, 11, 10, Y + 3.2, Y + 9);
      zadeldak(mb, 'dakpannenAntraciet', `muur:${stijl}`, schuur, v, 26, 16, Y + 3.6, Y + 12);
      // Voordeur, luiken en een schoorsteen.
      const vh = p(-6, 11.05);
      mb.quad('deur:2', P3({ x: vh.x - u.x * 0.55, z: vh.z - u.z * 0.55 }, Y), P3({ x: vh.x + u.x * 0.55, z: vh.z + u.z * 0.55 }, Y), P3({ x: vh.x + u.x * 0.55, z: vh.z + u.z * 0.55 }, Y + 2.2), P3({ x: vh.x - u.x * 0.55, z: vh.z - u.z * 0.55 }, Y + 2.2), [0, 0], [1, 0], [1, 1], [0, 1], { x: v.x, y: 0, z: v.z });
      for (const a of [-3.2, 3.2]) for (const k of [-0.95, 0.95]) { const q = p(-6 + a + k, 11.08); doos(mb, 'groenLak', 'groenLak', q, u, 0.45, 0.06, Y + 0.85, Y + 2.35); }
      doos(mb, `muur:${stijl}`, 'trimDonker', p(-9, 6), u, 0.7, 0.7, Y + 7, Y + 10.2);
      // Inrijdeuren van de schuur (achter en opzij) en kleine stalramen.
      for (const [c, n] of [[-20.05, -1], [-3.95, 1]] as const) {
        const m = p(-6, c);
        mb.quad('hout', P3({ x: m.x - u.x * 2.5, z: m.z - u.z * 2.5 }, Y), P3({ x: m.x + u.x * 2.5, z: m.z + u.z * 2.5 }, Y), P3({ x: m.x + u.x * 2.5, z: m.z + u.z * 2.5 }, Y + 3.5), P3({ x: m.x - u.x * 2.5, z: m.z - u.z * 2.5 }, Y + 3.5), [0, 0], [5, 0], [5, 3.5], [0, 3.5], { x: v.x * n, y: 0, z: v.z * n });
      }
      for (let k = -10; k <= 10; k += 3.3) for (const sd of [-1, 1]) { const q = p(-6 + sd * 13.05, -12 + k); mb.quad('raam', P3({ x: q.x - v.x * 0.5, z: q.z - v.z * 0.5 }, Y + 1.8), P3({ x: q.x + v.x * 0.5, z: q.z + v.z * 0.5 }, Y + 1.8), P3({ x: q.x + v.x * 0.5, z: q.z + v.z * 0.5 }, Y + 2.7), P3({ x: q.x - v.x * 0.5, z: q.z - v.z * 0.5 }, Y + 2.7), [0, 0], [1, 0], [1, 1], [0, 1], { x: u.x * sd, y: 0, z: u.z * sd }); }
      // Ligboxenstal achter de schuur: lage wand, open zijkanten met windbreekgaas, lichtnok.
      const stal = p(-6, -30);
      doos(mb, 'beton', 'beton', stal, u, 30, 14, Y - 0.3, Y + 1.2);
      doos(mb, 'hekwerk', 'golfdak', stal, u, 30, 14, Y + 1.2, Y + 3.6);
      zadeldak(mb, 'golfdak', 'golfplaat:2', stal, u, 30, 14, Y + 3.6, Y + 7.5, 0.8);
      doos(mb, 'lichtstraat', 'lichtstraat', p(-6, -30), u, 30, 0.8, Y + 7.3, Y + 7.9);
      // Sleufsilo met kuil onder zwart plastic en oude banden.
      const sl = p(14, -26);
      for (const k of [-4, 4]) doos(mb, 'beton', 'beton', { x: sl.x + u.x * k, z: sl.z + u.z * k }, v, 14, 0.4, Y - 0.2, Y + 2.4);
      doos(mb, 'rubber', 'rubber', sl, v, 13, 7.4, Y - 0.2, Y + 1.8);
      for (let i = 0; i < 10; i++) { const q = { x: sl.x + v.x * (i - 4.5) * 1.3 + u.x * ((i % 2) - 0.5) * 3, z: sl.z + v.z * (i - 4.5) * 1.3 + u.z * ((i % 2) - 0.5) * 3 }; cilinder(mb, 'autotrim', P3(q, Y + 1.8), P3(q, Y + 2.05), 0.45, 0.45, 8); }
      // Silo's met ladder, werktuigenloods (open voorkant) met een trekker.
      for (const [a, rr, h] of [[12, 2.4, 13], [17, 2, 10]] as const) {
        const q = p(a, -8);
        cilinder(mb, 'silo', P3(q, Y - 0.3), P3(q, Y + h), rr, rr, 16);
        cilinder(mb, 'silo', P3(q, Y + h), P3(q, Y + h + 1.6), rr, 0.3, 16);
        for (let k = 1; k < h / 2; k++) cilinder(mb, 'metaal', P3(q, Y + k * 2), P3(q, Y + k * 2 + 0.06), rr + 0.03, rr + 0.03, 16);
        doos(mb, 'metaal', 'metaal', { x: q.x + v.x * (rr + 0.2), z: q.z + v.z * (rr + 0.2) }, u, 0.5, 0.08, Y, Y + h);
      }
      const loods = p(14, 8);
      doos(mb, 'golfplaat:2', 'golfdak', { x: loods.x - v.x * 4.6, z: loods.z - v.z * 4.6 }, u, 14, 0.8, Y - 0.3, Y + 5.5);
      for (const k of [-6.6, 6.6]) doos(mb, 'golfplaat:2', 'golfdak', { x: loods.x + u.x * k, z: loods.z + u.z * k }, v, 10, 0.8, Y - 0.3, Y + 5.5);
      doos(mb, 'golfdak', 'golfdak', loods, u, 14.4, 10.4, Y + 5.5, Y + 5.8);
      trekker(mb, { x: loods.x + u.x * 2, z: loods.z + u.z * 2 }, v, Y, r.kies(['politieoranje', 'groenLak', 'remklauw']));
      // Ronde balen, mestkelder en een melktank.
      for (let i = 0; i < 6; i++) hooibaal(mb, p(-18 + (i % 3) * 1.4, -16 + Math.floor(i / 3) * 1.4), u, Y, i % 4 !== 3);
      const mest = p(18, -40);
      cilinder(mb, 'beton', P3(mest, Y - 0.3), P3(mest, Y + 3), 7, 7, 24);
      cilinder(mb, 'tank', P3(mest, Y + 3), P3(mest, Y + 4.5), 7, 0.6, 24);
      cilinder(mb, 'tank', P3(p(5, -24), Y + 0.6), P3(p(5, -21), Y + 0.6), 0.9, 0.9, 12);
      // Brievenbus en een rij knotwilgen langs de oprit.
      doos(mb, 'remklauw', 'remklauw', p(-14, 19.5), u, 0.4, 0.3, Y + 1, Y + 1.4);
      for (let i = 0; i < 4; i++) { const q = p(6 + i * 4, 19); props.push({ soort: 'linde', x: q.x, y: Y, z: q.z, rot: i, schaal: 0.55, variant: i % 2 }); }
      props.push({ soort: 'linde', x: p(-14, 16).x, y: Y, z: p(-14, 16).z, rot: 1, schaal: 0.9, variant: 0 });
      props.push({ soort: 'eik', x: p(-18, -2).x, y: Y, z: p(-18, -2).z, rot: 2, schaal: 1, variant: 1 });
      break;
    }
    case 'bosbouw': {
      erf(60, 44, 'erfverharding');
      // Zagerij: open hal op kolommen met een zaagstraat, houten kantoortje, droogloods met planken,
      // stammen gesorteerd op lengte, een kraan en een forwarder.
      const hal = p(-14, -10);
      doos(mb, 'golfdak', 'golfdak', hal, u, 23, 15, Y + 7, Y + 7.3);
      for (const a of [-11, -5.5, 0, 5.5, 11]) for (const c of [-7, 7]) { const q = { x: hal.x + u.x * a + v.x * c, z: hal.z + u.z * a + v.z * c }; doos(mb, 'metaal', 'metaal', q, u, 0.35, 0.35, Y, Y + 7); }
      doos(mb, 'golfplaat:2', 'golfdak', { x: hal.x - v.x * 7, z: hal.z - v.z * 7 }, u, 23, 0.4, Y, Y + 7);
      doos(mb, 'metaal', 'metaal', hal, u, 18, 1.5, Y, Y + 1.1);
      doos(mb, 'kraan', 'kraan', { x: hal.x - u.x * 3, z: hal.z - u.z * 3 }, u, 2.5, 2.5, Y, Y + 2.6);
      gebouwBlok(mb, p(18, 14), u, 8, 6, Y - 0.2, Y + 3, 'gevel:houtGevel', { dak: 'golfdak', rand: 'trimDonker', randH: 0.3 });
      const droog = p(18, -12);
      doos(mb, 'golfdak', 'golfdak', droog, u, 12, 8, Y + 5, Y + 5.3);
      for (const a of [-5.5, 0, 5.5]) for (const c of [-3.7, 3.7]) doos(mb, 'hout', 'hout', { x: droog.x + u.x * a + v.x * c, z: droog.z + u.z * a + v.z * c }, u, 0.3, 0.3, Y, Y + 5);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) doos(mb, 'hout', 'hout', { x: droog.x + u.x * (-3.5 + i * 2.4) + v.x * (j * 3 - 1.5), z: droog.z + u.z * (-3.5 + i * 2.4) + v.z * (j * 3 - 1.5) }, v, 2.2, 1.2, Y, Y + 0.8 + ((i + j) % 3) * 0.6);
      for (let i = 0; i < 6; i++) {
        const c = p(-2 + (i % 3) * 9, 8 + Math.floor(i / 3) * 7);
        const L = 3 + (i % 3) * 0.8;
        for (let laag = 0; laag < 3; laag++) for (let k = 0; k < 5 - laag; k++) {
          const off = (k - (4 - laag) / 2) * 0.9;
          const a = { x: c.x + v.x * off - u.x * L, z: c.z + v.z * off - u.z * L }, e = { x: c.x + v.x * off + u.x * L, z: c.z + v.z * off + u.z * L };
          cilinder(mb, 'schors', P3(a, Y + 0.45 + laag * 0.78), P3(e, Y + 0.45 + laag * 0.78), 0.42, 0.4, 7);
          // Zaagvlakken aan de kopse kanten.
          for (const q of [a, e]) cilinder(mb, 'hout', P3({ x: q.x - u.x * 0.01, z: q.z - u.z * 0.01 }, Y + 0.45 + laag * 0.78), P3({ x: q.x + u.x * 0.01, z: q.z + u.z * 0.01 }, Y + 0.45 + laag * 0.78), 0.38, 0.38, 7);
        }
        // Stutten.
        for (const sd of [-1, 1]) doos(mb, 'metaal', 'metaal', { x: c.x + v.x * sd * 2.5, z: c.z + v.z * sd * 2.5 }, u, 0.2, 0.2, Y, Y + 2.5);
      }
      // Forwarder (bosbouwmachine): twee delen met een kraanarm.
      const f = p(-2, 18);
      doos(mb, 'politieoranje', 'politieoranje', f, u, 3, 2.4, Y + 0.9, Y + 2.2);
      doos(mb, 'autoglas', 'politieoranje', { x: f.x - u.x * 0.5, z: f.z - u.z * 0.5 }, u, 1.6, 2, Y + 2.2, Y + 3.6);
      doos(mb, 'metaal', 'metaal', { x: f.x + u.x * 4, z: f.z + u.z * 4 }, u, 5, 2.4, Y + 0.9, Y + 1.5);
      for (const a of [-0.6, 3, 5.4]) for (const sd of [-1, 1]) { const q = { x: f.x + u.x * a + v.x * sd * 1.3, z: f.z + u.z * a + v.z * sd * 1.3 }; cilinder(mb, 'rubber', P3({ x: q.x - v.x * sd * 0.3, z: q.z - v.z * sd * 0.3 }, Y + 0.65), P3({ x: q.x + v.x * sd * 0.3, z: q.z + v.z * sd * 0.3 }, Y + 0.65), 0.65, 0.65, 12); }
      cilinder(mb, 'politieoranje', P3({ x: f.x + u.x * 1.8, z: f.z + u.z * 1.8 }, Y + 1.5), P3({ x: f.x + u.x * 3.5, z: f.z + u.z * 3.5 }, Y + 4.5), 0.15, 0.12, 6);
      cilinder(mb, 'politieoranje', P3({ x: f.x + u.x * 3.5, z: f.z + u.z * 3.5 }, Y + 4.5), P3({ x: f.x + u.x * 6, z: f.z + u.z * 6 }, Y + 2.5), 0.12, 0.1, 6);
      break;
    }
    case 'olie': {
      erf(40, 36, 'erfverharding');
      // Tankopslag met trappen en leuningen in een bak (dijkje), leidingbrug, fakkel en een kantoor.
      const bak = p(-1, -6);
      for (const [a, c, l, w] of [[0, -6, 36, 0.4], [0, 6, 36, 0.4], [-18, 0, 0.4, 12], [18, 0, 0.4, 12]] as const) doos(mb, 'beton', 'beton', { x: bak.x + u.x * a + v.x * c, z: bak.z + u.z * a + v.z * c }, u, l, w, Y - 0.2, Y + 1);
      for (let i = 0; i < 3; i++) tank(mb, p(-12 + i * 11, -6), Y, 4.5, 8);
      leidingbrug(mb, p(-16, 3), p(18, 3), Y, 2.4, 3);
      const fakkel = p(16, -15);
      cilinder(mb, 'metaal', P3(fakkel, Y), P3(fakkel, Y + 16), 0.35, 0.25, 8);
      cilinder(mb, 'remklauw', P3(fakkel, Y + 16), P3(fakkel, Y + 16.6), 0.4, 0.4, 8);
      for (const k of [0, 2.1, 4.2]) { const q = { x: fakkel.x + Math.cos(k) * 4, z: fakkel.z + Math.sin(k) * 4 }; cilinder(mb, 'metaal', P3(q, Y), P3(fakkel, Y + 12), 0.04, 0.04, 4); }
      gebouwBlok(mb, p(12, 10), u, 9, 5, Y - 0.2, Y + 3.2, 'gevel:modernDonker', { dak: 'dakgrind', randH: 0.3 });
      doos(mb, 'kraan', 'kraan', p(-12, 12), u, 10, 2.5, Y + 1, Y + 3.6);
      for (const a of [-15, -9]) cilinder(mb, 'rubber', P3(p(a, 10.8), Y + 0.5), P3(p(a, 13.2), Y + 0.5), 0.5, 0.5, 10);
      mb.quad('hekwerk', P3(p(-20, 18), Y), P3(p(20, 18), Y), P3(p(20, 18), Y + 2), P3(p(-20, 18), Y + 2), [0, 0], [40 / 3.5, 0], [40 / 3.5, 1], [0, 1], { x: v.x, y: 0, z: v.z });
      for (const q of b.putten) {
        gedrapeerd(mb, 'erfverharding', [{ x: q.x - 7, z: q.z - 4 }, { x: q.x + 7, z: q.z - 4 }, { x: q.x + 7, z: q.z + 4 }, { x: q.x - 7, z: q.z + 4 }], hoogte, 0.08);
        // Putkop met afsluiters en een klein hekje.
        const y = hoogte(q.x, q.z) + 0.1;
        doos(mb, 'metaal', 'metaal', { x: q.x + 4.5, z: q.z }, { x: 1, z: 0 }, 1.2, 1.2, y, y + 1.6);
        cilinder(mb, 'remklauw', { x: q.x + 4.5, y: y + 1.6, z: q.z }, { x: q.x + 4.5, y: y + 1.9, z: q.z }, 0.35, 0.35, 8);
        props.push({ soort: 'jaknikker', x: q.x, y, z: q.z, rot: r.range(0, 6.28), schaal: 1, variant: 0 });
      }
      break;
    }
    case 'delfstoffen': {
      erf(56, 44, 'erfverharding');
      // Breker en zeefinstallatie op een staalconstructie, transportbanden op poten, zand- en grindbergen,
      // een graafmachine, een shovel, kantoorunits en een weegbrug.
      const breker = p(-12, -6);
      doos(mb, 'golfplaat:0', 'golfdak', breker, u, 12, 10, Y + 4, Y + 11);
      for (const a of [-5.5, 5.5]) for (const c of [-4.5, 4.5]) doos(mb, 'kraan', 'kraan', { x: breker.x + u.x * a + v.x * c, z: breker.z + u.z * a + v.z * c }, u, 0.4, 0.4, Y, Y + 4);
      doos(mb, 'metaal', 'metaal', breker, u, 6, 4, Y, Y + 4);
      const band = (b0: V2, b1: V2, h0: number, h1: number) => {
        const L = Math.hypot(b1.x - b0.x, b1.z - b0.z), dir = { x: (b1.x - b0.x) / L, z: (b1.z - b0.z) / L };
        for (let t = 0; t < 1; t += 0.1) {
          const a = { x: b0.x + (b1.x - b0.x) * t, z: b0.z + (b1.z - b0.z) * t }, e = { x: b0.x + (b1.x - b0.x) * (t + 0.1), z: b0.z + (b1.z - b0.z) * (t + 0.1) };
          const ya = Y + h0 + (h1 - h0) * t, ye = Y + h0 + (h1 - h0) * (t + 0.1);
          mb.quad('rubber', P3({ x: a.x - dir.z * 0.6, z: a.z + dir.x * 0.6 }, ya), P3({ x: a.x + dir.z * 0.6, z: a.z - dir.x * 0.6 }, ya), P3({ x: e.x + dir.z * 0.6, z: e.z - dir.x * 0.6 }, ye), P3({ x: e.x - dir.z * 0.6, z: e.z + dir.x * 0.6 }, ye), [0, 0], [1, 0], [1, 1], [0, 1], OP);
          for (const k of [-0.7, 0.7]) cilinder(mb, 'metaal', P3({ x: a.x - dir.z * k, z: a.z + dir.x * k }, ya - 0.1), P3({ x: e.x - dir.z * k, z: e.z + dir.x * k }, ye - 0.1), 0.08, 0.08, 4);
          if (Math.round(t * 10) % 3 === 0) for (const k of [-0.7, 0.7]) cilinder(mb, 'kraan', P3({ x: a.x - dir.z * k, z: a.z + dir.x * k }, Y), P3({ x: a.x - dir.z * k, z: a.z + dir.x * k }, ya - 0.1), 0.08, 0.08, 4);
        }
      };
      band(p(-6, -6), p(14, 10), 5.5, 7.5);
      band(p(-12, -1), p(2, 14), 4, 5.5);
      band(p(-6, -9), p(20, -10), 5, 6.5);
      for (const [a, c, rr, h, mat] of [[14, 10, 9, 7, 'zandberg'], [2, 14, 7, 5, 'grind'], [20, -10, 8, 6, 'zandberg']] as [number, number, number, number, string][]) {
        const m = p(a, c);
        cilinder(mb, mat, P3(m, Y - 0.2), P3(m, Y + h), rr, 0.3, 18);
      }
      // Graafmachine.
      const gm = p(-20, 14);
      doos(mb, 'rubber', 'rubber', gm, u, 4.2, 3.2, Y, Y + 0.9);
      doos(mb, 'kraan', 'kraan', gm, u, 3.2, 2.6, Y + 0.9, Y + 2.2);
      doos(mb, 'autoglas', 'kraan', { x: gm.x + u.x * 0.6 + v.x * 0.6, z: gm.z + u.z * 0.6 + v.z * 0.6 }, u, 1.2, 1.2, Y + 2.2, Y + 3.5);
      cilinder(mb, 'kraan', P3({ x: gm.x + u.x * 1, z: gm.z + u.z * 1 }, Y + 2), P3({ x: gm.x + u.x * 4, z: gm.z + u.z * 4 }, Y + 5), 0.25, 0.22, 6);
      cilinder(mb, 'kraan', P3({ x: gm.x + u.x * 4, z: gm.z + u.z * 4 }, Y + 5), P3({ x: gm.x + u.x * 6, z: gm.z + u.z * 6 }, Y + 1), 0.2, 0.18, 6);
      doos(mb, 'metaal', 'metaal', { x: gm.x + u.x * 6, z: gm.z + u.z * 6 }, u, 1, 1.2, Y + 0.3, Y + 1.2);
      // Kantoorunits en een weegbrug.
      for (let i = 0; i < 2; i++) container(mb, p(20, 14 + i * 2.6), u, Y, i + 1);
      doos(mb, 'beton', 'metaal', p(6, 20), u, 16, 3.5, Y, Y + 0.3);
      const put = b.putten[0];
      if (put) {
        const y = hoogte(put.x, put.z) + 0.6;
        const pts: V2[] = [];
        for (let i = 0; i < 24; i++) { const h = i / 24 * Math.PI * 2; pts.push({ x: put.x + Math.cos(h) * 22, z: put.z + Math.sin(h) * 22 }); }
        const tri = driehoeken(pts);
        for (let i = 0; i < tri.length; i += 3) mb.driehoek('plas', P3(pts[tri[i]], y), P3(pts[tri[i + 1]], y), P3(pts[tri[i + 2]], y), [pts[tri[i]].x, pts[tri[i]].z], [pts[tri[i + 1]].x, pts[tri[i + 1]].z], [pts[tri[i + 2]].x, pts[tri[i + 2]].z], OP);
        // Zandzuiger met een drijvende persleiding naar de kant.
        doos(mb, 'kraan', 'kraan', { x: put.x + 6, z: put.z }, u, 6, 3, y - 0.2, y + 1.6);
        doos(mb, 'autoglas', 'kraan', { x: put.x + 5, z: put.z }, u, 2, 2, y + 1.6, y + 3);
        cilinder(mb, 'kraan', { x: put.x + 7, y: y + 1, z: put.z }, { x: put.x + 7, y: y + 9, z: put.z }, 0.25, 0.2, 6);
        for (let i = 0; i < 8; i++) cilinder(mb, 'turbinewit', { x: put.x + 9 + i * 1.6, y, z: put.z }, { x: put.x + 10.4 + i * 1.6, y, z: put.z }, 0.35, 0.35, 8);
      }
      break;
    }
  }
  void g; void dakkasten;
  return { mesh: mb.bouw(), props };
}
