import { V2, add2, dist2, dot2, mul2, perp2, polygonenOverlappen, puntInPolygoon, sub2, lerp2, norm2, saturate } from './math';
import { Terrein, ZEENIVEAU } from './terrain';
import { Wegennet, Segment } from './wegen/netwerk';
import { WEGTYPEN, WegTypeId, halveBreedte } from './wegen/typen';
import { Bomen } from './bomen';
import { Rng } from './rng';
import { Capaciteit, Functie, GebouwVorm, Zone, berekenCapaciteit, verdiepingHoogte, KENGETALLEN } from './zones';

export interface Kavel {
  id: number; seg: number; zijde: 1 | -1;
  /** p0,p1 = voorkant langs de weg, p2,p3 = achterkant. */
  poly: V2[];
  voor: V2; langs: V2; binnen: V2;
  breedte: number; diepte: number;
  zone: Zone; gebouw: number;
}

export interface Laag { functie: Functie; hoogte: number }

/** Het perceel waarop een gebouw staat: één kavel of een paar samengevoegde kavels langs dezelfde straat. */
export interface Perceel { poly: V2[]; voor: V2; langs: V2; binnen: V2; breedte: number; diepte: number }

export interface Gebouw {
  id: number; kavel: number; kavels: number[]; perceel: Perceel; zone: Zone; vorm: GebouwVorm;
  /** Middelpunt van de footprint; `voor` wijst naar de straat; `breedte` loopt langs de straat. */
  centrum: V2; voor: V2; breedte: number; diepte: number;
  /** Vloerpeil (net boven het hoogste maaiveldpunt) en het laagste maaiveldpunt eronder. */
  y: number; yGrond: number;
  lagen: Laag[]; eenheden: number; seed: number;
  voortgang: number; klaar: boolean; bezetting: number;
  cap: Capaciteit;
}

export interface Statistiek {
  inwoners: number; woningen: number; beroeps: number; werkenden: number; werkloosheid: number;
  banen: number; banenD: number; banenH: number; banenK: number; banenI: number; banenO: number;
  gebouwenKlaar: number; inAanbouw: number;
}
export interface Vraag { wonen: number; detailhandel: number; kantoor: number; industrie: number }

export type WereldEvent =
  | { soort: 'seg+' | 'seg-' | 'knoop~'; id: number }
  | { soort: 'kavel+' | 'kavel-' | 'kavel~'; id: number }
  | { soort: 'gebouw+' | 'gebouw-' | 'gebouw~'; id: number };

export const KAVEL_BREEDTE = 16;
export const KAVEL_DIEPTE = 32;
export const SECONDEN_PER_DAG = 4;

export const totaleHoogte = (lagen: Laag[]) => lagen.reduce((s, l) => s + l.hoogte, 0);

export class Wereld {
  terrein: Terrein;
  net: Wegennet;
  bomen: Bomen;
  kavels = new Map<number, Kavel>();
  gebouwen = new Map<number, Gebouw>();
  events: WereldEvent[] = [];
  snelheid = 1;
  dagen = 0;
  geld = 5_000_000;
  stat: Statistiek = { inwoners: 0, woningen: 0, beroeps: 0, werkenden: 0, werkloosheid: 0, banen: 0, banenD: 0, banenH: 0, banenK: 0, banenI: 0, banenO: 0, gebouwenKlaar: 0, inAanbouw: 0 };
  vraag: Vraag = { wonen: 0.6, detailhandel: 0.1, kantoor: 0.05, industrie: 0.15 };
  private volgende = 1;
  private rng: Rng;
  private bouwKlok = 0;
  private statKlok = 0;

  constructor(readonly seed = 1) {
    this.terrein = new Terrein(2048, 4, seed);
    this.net = new Wegennet(this.terrein);
    this.bomen = new Bomen(this.terrein, seed * 7 + 4242);
    this.rng = new Rng(seed * 977 + 13);
  }

  haalEvents() { const e = this.events; this.events = []; return e; }

  // ─── Wegen ──────────────────────────────────────────────────────────────────

  legWeg(a: V2, c: V2, b: V2, type: WegTypeId): { ok: boolean; fout?: string } {
    const fout = this.net.controleer(a, c, b, type);
    if (fout) return { ok: false, fout };
    const kosten = WEGTYPEN[type].kosten * (dist2(a, c) + dist2(c, b));
    if (kosten > this.geld) return { ok: false, fout: 'Niet genoeg geld' };
    const nieuw = this.net.leg(a, c, b, type);
    if (!nieuw.length) return { ok: false, fout: 'Kan hier geen weg leggen' };
    this.geld -= kosten;
    this.verwerkNet();
    for (const seg of nieuw) {
      this.ruimOpLangs(seg);
      this.wisBomenLangs(seg);
    }
    for (const seg of nieuw) this.genereerKavels(seg);
    return { ok: true };
  }

  sloopWeg(id: number) {
    const seg = this.net.segmenten.get(id);
    if (!seg) return;
    this.net.verwijderSegment(id);
    this.verwerkNet();
    this.geld += WEGTYPEN[seg.type].kosten * seg.lengte * 0.25;
  }

  wijzigWeg(id: number, type: WegTypeId) {
    const seg = this.net.segmenten.get(id);
    if (!seg || seg.type === type) return false;
    const extra = (WEGTYPEN[type].kosten - WEGTYPEN[seg.type].kosten * 0.5) * seg.lengte;
    if (extra > this.geld) return false;
    this.net.wijzigType(id, type);
    this.geld -= Math.max(0, extra);
    this.verwerkNet();
    // Breder profiel: kavels die nu op de weg liggen gaan weg; nieuwe kavels als het type erftoegang heeft.
    this.ruimOpLangs(seg);
    this.wisBomenLangs(seg);
    for (const k of [...this.kavels.values()]) if (k.seg === id && !this.kavelPastBijWeg(k, seg)) this.verwijderKavel(k.id);
    if (WEGTYPEN[type].erf && ![...this.kavels.values()].some(k => k.seg === id)) this.genereerKavels(seg);
    if (!WEGTYPEN[type].erf) for (const k of [...this.kavels.values()]) if (k.seg === id) this.verwijderKavel(k.id);
    return true;
  }

  /** Netwerk-events doorgeven en kavels van gesplitste/verwijderde segmenten herverdelen. */
  private verwerkNet() {
    const ev = this.net.haalEvents();
    const weg = new Set<number>();
    for (const e of ev) {
      this.events.push(e);
      if (e.soort === 'seg-') weg.add(e.id);
      if (e.soort === 'seg+') weg.delete(e.id);
    }
    if (!weg.size) return;
    for (const k of [...this.kavels.values()]) {
      if (!weg.has(k.seg)) continue;
      // Zoek het segment waar de voorkant van de kavel nu langs ligt.
      let best: Segment | null = null, bd = Infinity;
      for (const s of this.net.segmenten.values()) {
        if (!WEGTYPEN[s.type].erf) continue;
        const d = this.afstandTotAs(k.voor, s);
        const doel = halveBreedte(s.type);
        if (Math.abs(d - doel) < 2.5 && Math.abs(d - doel) < bd) { bd = Math.abs(d - doel); best = s; }
      }
      if (best) k.seg = best.id; else this.verwijderKavel(k.id);
    }
  }

  private afstandTotAs(p: V2, seg: Segment): number {
    let best = Infinity;
    const pad = seg.pad;
    for (let i = 0; i < pad.length - 1; i++) {
      const a = pad[i], b = pad[i + 1];
      const ab = { x: b.x - a.x, z: b.z - a.z };
      const l2 = ab.x * ab.x + ab.z * ab.z;
      const t = l2 > 0 ? saturate(((p.x - a.x) * ab.x + (p.z - a.z) * ab.z) / l2) : 0;
      best = Math.min(best, Math.hypot(p.x - (a.x + ab.x * t), p.z - (a.z + ab.z * t)));
    }
    return best;
  }

  /** Raakt een weg dit polygoon? (punt-tot-polygoon-afstand kleiner dan de halve wegbreedte) */
  private wegRaakt(poly: V2[], alleen?: Segment): boolean {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    const lijst = alleen ? [alleen] : this.net.segmenten.values();
    for (const seg of lijst) {
      const hb = halveBreedte(seg.type) - 0.2;
      for (let i = 0; i < seg.pad.length - 1; i++) {
        const a = seg.pad[i], b = seg.pad[i + 1];
        if (Math.max(a.x, b.x) < x0 - hb || Math.min(a.x, b.x) > x1 + hb || Math.max(a.z, b.z) < z0 - hb || Math.min(a.z, b.z) > z1 + hb) continue;
        for (let t = 0; t <= 1; t += 0.25) {
          const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
          if (puntInPolygoon(p, poly) || afstandTotPolygoon(p, poly) < hb) return true;
        }
      }
    }
    return false;
  }

  private kavelPastBijWeg(k: Kavel, seg: Segment) { return !this.wegRaakt(k.poly, seg); }

  /** Kavels (ook bebouwde, zoals in Cities: Skylines) die de nieuwe weg raakt, gaan weg. */
  private ruimOpLangs(seg: Segment) {
    for (const k of [...this.kavels.values()]) if (this.wegRaakt(k.poly, seg)) this.verwijderKavel(k.id);
  }

  private wisBomenLangs(seg: Segment) {
    const hb = halveBreedte(seg.type) + 2.5;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of seg.pad) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    this.bomen.wis(x0 - hb, z0 - hb, x1 + hb, z1 + hb, (x, z) => this.afstandTotAs({ x, z }, seg) < hb);
  }

  // ─── Kavels ─────────────────────────────────────────────────────────────────

  /** Punt en richting op booglengte s langs het pad. */
  static opPad(seg: Segment, s: number): { p: V2; d: V2 } {
    const pad = seg.pad;
    for (let i = 0; i < pad.length - 1; i++) {
      if (s <= pad[i + 1].s || i === pad.length - 2) {
        const a = pad[i], b = pad[i + 1];
        const t = saturate((s - a.s) / Math.max(1e-6, b.s - a.s));
        return { p: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, d: norm2({ x: b.x - a.x, z: b.z - a.z }) };
      }
    }
    return { p: { x: pad[0].x, z: pad[0].z }, d: { x: 1, z: 0 } };
  }

  genereerKavels(seg: Segment) {
    const type = WEGTYPEN[seg.type];
    if (!type.erf) return;
    const hb = halveBreedte(seg.type);
    const s0 = 1, s1 = seg.lengte - 1;
    const n = Math.floor((s1 - s0) / KAVEL_BREEDTE);
    if (n < 1) return;
    const w = (s1 - s0) / n;
    for (let i = 0; i < n; i++) {
      const sm = s0 + (i + 0.5) * w;
      const { p, d } = Wereld.opPad(seg, sm);
      const midden = seg.pad[Math.min(seg.pad.length - 1, Math.round(sm / Math.max(1e-6, seg.lengte) * (seg.pad.length - 1)))];
      if (midden?.brug) continue;
      for (const zijde of [1, -1] as const) {
        const binnen = mul2(perp2(d), zijde);
        let voor = add2(p, mul2(binnen, hb));
        // In een bocht snijdt de rechte voorkant in de weg: schuif de kavel naar buiten.
        let indringing = 0;
        for (const q of seg.pad) {
          if (q.s < sm - w / 2 - 2 || q.s > sm + w / 2 + 2) continue;
          const nq = mul2(perp2({ x: q.dx, z: q.dz }), zijde);
          const rand = { x: q.x + nq.x * hb, z: q.z + nq.z * hb };
          indringing = Math.max(indringing, dot2(sub2(rand, voor), binnen));
        }
        voor = add2(voor, mul2(binnen, indringing + 0.05));
        const half = mul2(d, w / 2);
        const p0 = sub2(voor, half), p1 = add2(voor, half);
        const p2 = add2(p1, mul2(binnen, KAVEL_DIEPTE)), p3 = add2(p0, mul2(binnen, KAVEL_DIEPTE));
        const poly = [p0, p1, p2, p3];
        if (!this.kavelGeldig(poly)) continue;
        const k: Kavel = { id: this.volgende++, seg: seg.id, zijde, poly, voor, langs: d, binnen, breedte: w, diepte: KAVEL_DIEPTE, zone: 'geen', gebouw: 0 };
        this.kavels.set(k.id, k);
        this.events.push({ soort: 'kavel+', id: k.id });
      }
    }
  }

  private kavelGeldig(poly: V2[]): boolean {
    const t = this.terrein;
    let lo = Infinity, hi = -Infinity;
    const c = lerp2(lerp2(poly[0], poly[1], 0.5), lerp2(poly[2], poly[3], 0.5), 0.5);
    for (const p of [...poly, c]) {
      if (!t.binnen(p.x, p.z, 8)) return false;
      const h = t.hoogte(p.x, p.z);
      if (h < ZEENIVEAU + 0.6) return false;
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (hi - lo > 6) return false;
    if (this.wegRaakt(poly)) return false;
    const krimp = krimpPolygoon(poly, 0.3);
    for (const k of this.kavels.values()) {
      if (Math.abs(k.voor.x - c.x) > 60 || Math.abs(k.voor.z - c.z) > 60) continue;
      if (polygonenOverlappen(krimp, k.poly)) return false;
    }
    return true;
  }

  verwijderKavel(id: number) {
    const k = this.kavels.get(id);
    if (!k) return;
    if (k.gebouw) this.verwijderGebouw(k.gebouw);
    this.kavels.delete(id);
    this.events.push({ soort: 'kavel-', id });
  }

  /** Zoneer alle kavels waarvan het middelpunt binnen de straal ligt. */
  zoneer(m: V2, straal: number, zone: Zone): number {
    let n = 0;
    for (const k of this.kavels.values()) {
      const c = kavelMidden(k);
      if (dist2(c, m) > straal + 4) continue;
      if (k.zone === zone) continue;
      if (k.gebouw) {
        if (zone !== 'geen') continue;
        this.verwijderGebouw(k.gebouw);
      }
      k.zone = zone; n++;
      this.events.push({ soort: 'kavel~', id: k.id });
    }
    return n;
  }

  // ─── Gebouwen ───────────────────────────────────────────────────────────────

  private ontwerp(k: Perceel, zoneVan: Zone, seed: number, kavels: number[]): Gebouw | null {
    const r = new Rng(seed);
    let vorm: GebouwVorm, lagen: number, eenheden = 1, breedte: number, diepte: number, terug: number;
    switch (zoneVan) {
      case 'wonenLaag': vorm = 'rijwoningen'; lagen = r.next() < 0.65 ? 2 : 3; eenheden = Math.max(2, Math.round(k.breedte / 5.4));
        breedte = k.breedte - 0.1; diepte = r.range(9, 10.5); terug = r.range(3, 5); break;
      case 'wonenHoog': vorm = 'appartementen'; lagen = r.int(4, 9); breedte = k.breedte - 3; diepte = r.range(12, 15); terug = r.range(4, 6);
        if (kavels.length > 1) { lagen = r.int(5, 12); breedte = Math.min(breedte, r.range(24, 40)); } break;
      case 'gemengd': vorm = 'winkelsMetWonen'; lagen = r.int(3, 5); breedte = k.breedte - 0.1; diepte = r.range(12, 15); terug = 0.3; break;
      case 'kantoor': vorm = 'kantoortoren'; lagen = kavels.length > 1 ? r.int(6, 18) : r.int(4, 8); breedte = k.breedte - 3; diepte = r.range(17, 22); terug = r.range(4, 6); break;
      case 'industrie': vorm = 'bedrijfshal'; lagen = 1; breedte = k.breedte - 3; diepte = r.range(24, 32); terug = r.range(6, 9); break;
      default: return null;
    }
    diepte = Math.min(diepte, k.diepte - terug - 2);
    if (diepte < 6) return null;
    const ls: Laag[] = [];
    for (let i = 0; i < lagen; i++) {
      const bg = i === 0;
      const f: Functie = vorm === 'winkelsMetWonen' ? (bg ? (r.next() < 0.25 ? 'horeca' : 'detailhandel') : 'wonen')
        : vorm === 'kantoortoren' ? 'kantoor' : vorm === 'bedrijfshal' ? 'industrie' : 'wonen';
      ls.push({ functie: f, hoogte: verdiepingHoogte(f, bg) });
    }
    const centrum = add2(k.voor, mul2(k.binnen, terug + diepte / 2));
    const voor = mul2(k.binnen, -1);
    // Vloerpeil: laagste punt onder de footprint, zodat het gebouw nergens zweeft.
    const ax = k.langs, az = k.binnen;
    let y = -Infinity, yGrond = Infinity;
    for (const [u, v] of [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5], [0, 0], [0, -.5], [0, .5]]) {
      const p = add2(centrum, add2(mul2(ax, u * breedte), mul2(az, v * diepte)));
      const h = this.terrein.hoogte(p.x, p.z);
      y = Math.max(y, h); yGrond = Math.min(yGrond, h);
    }
    y += 0.15;
    return {
      id: this.volgende++, kavel: kavels[0], kavels, perceel: k, zone: zoneVan, vorm, centrum, voor, breedte, diepte, y, yGrond,
      lagen: ls, eenheden, seed: Math.floor(r.next() * 2 ** 31), voortgang: 0, klaar: false, bezetting: 0,
      cap: berekenCapaciteit(vorm, breedte * diepte, ls.map(l => l.functie), eenheden),
    };
  }

  /** Lege buurkavel met dezelfde zone, direct naast deze kavel langs dezelfde straat. */
  private buur(k: Kavel, rechts: boolean): Kavel | null {
    for (const n of this.kavels.values()) {
      if (n === k || n.seg !== k.seg || n.zijde !== k.zijde || n.zone !== k.zone || n.gebouw) continue;
      if (rechts ? dist2(k.poly[1], n.poly[0]) < 0.8 : dist2(k.poly[0], n.poly[1]) < 0.8) return n;
    }
    return null;
  }

  private startBouw(k: Kavel) {
    // Grote gebouwen nemen vaak meerdere kavels in (zoals een ontwikkelaar die percelen samenvoegt).
    const kans: Partial<Record<Zone, number>> = { kantoor: 0.75, wonenHoog: 0.5, industrie: 0.65 };
    const max: Partial<Record<Zone, number>> = { kantoor: 3, wonenHoog: 2, industrie: 3 };
    const reeks = [k];
    if (this.rng.next() < (kans[k.zone] ?? 0)) {
      const doel = 2 + (this.rng.next() < 0.4 ? 1 : 0);
      while (reeks.length < Math.min(doel, max[k.zone] ?? 1)) {
        const r = this.buur(reeks[reeks.length - 1], true), l = r ? null : this.buur(reeks[0], false);
        if (r) reeks.push(r); else if (l) reeks.unshift(l); else break;
      }
    }
    const a = reeks[0], b = reeks[reeks.length - 1];
    const poly = [a.poly[0], b.poly[1], b.poly[2], a.poly[3]];
    const perceel: Perceel = { poly, voor: lerp2(a.poly[0], b.poly[1], 0.5), langs: k.langs, binnen: k.binnen, breedte: dist2(a.poly[0], b.poly[1]), diepte: k.diepte };
    const g = this.ontwerp(perceel, k.zone, Math.floor(this.rng.next() * 2 ** 31), reeks.map(x => x.id));
    if (!g) return;
    this.gebouwen.set(g.id, g);
    for (const x of reeks) { x.gebouw = g.id; this.events.push({ soort: 'kavel~', id: x.id }); }
    this.bomen.wisInPolygoon(poly, 2);
    this.events.push({ soort: 'gebouw+', id: g.id });
  }

  verwijderGebouw(id: number) {
    const g = this.gebouwen.get(id);
    if (!g) return;
    this.gebouwen.delete(id);
    for (const kid of g.kavels) {
      const k = this.kavels.get(kid);
      if (k && k.gebouw === id) { k.gebouw = 0; this.events.push({ soort: 'kavel~', id: k.id }); }
    }
    this.events.push({ soort: 'gebouw-', id });
  }

  /** Wat staat er op dit punt? (voor de sloophamer en info) */
  gebouwOp(p: V2): Gebouw | null {
    for (const g of this.gebouwen.values()) {
      const d = sub2(p, g.centrum);
      const u = Math.abs(dot2(d, perp2(g.voor))), v = Math.abs(dot2(d, g.voor));
      if (u <= g.breedte / 2 + 0.5 && v <= g.diepte / 2 + 0.5) return g;
    }
    return null;
  }

  // ─── Simulatie ──────────────────────────────────────────────────────────────

  vraagVoor(z: Zone) {
    const v = this.vraag;
    switch (z) {
      case 'wonenLaag': case 'wonenHoog': return v.wonen;
      case 'gemengd': return Math.max(v.wonen, v.detailhandel) * 0.9;
      case 'kantoor': return v.kantoor;
      case 'industrie': return v.industrie;
      default: return 0;
    }
  }

  stap(dtEcht: number) {
    const dt = Math.min(0.25, dtEcht) * this.snelheid;
    if (dt <= 0) return;
    this.dagen += dt / SECONDEN_PER_DAG;

    for (const g of this.gebouwen.values()) {
      if (!g.klaar) {
        const duur = 8 + 1.6 * g.lagen.length;
        const oud = Math.floor(g.voortgang * g.lagen.length * 2);
        g.voortgang = Math.min(1, g.voortgang + dt / duur);
        if (g.voortgang >= 1) { g.klaar = true; this.events.push({ soort: 'gebouw~', id: g.id }); }
        else if (Math.floor(g.voortgang * g.lagen.length * 2) !== oud) this.events.push({ soort: 'gebouw~', id: g.id });
      } else if (g.bezetting < 1) {
        g.bezetting = Math.min(1, g.bezetting + dt * 0.035 * (0.35 + this.vraagVoor(g.zone)));
      }
    }

    this.bouwKlok += dt;
    if (this.bouwKlok >= 0.3) {
      this.bouwKlok = 0;
      // Per zonesoort: met een kans gelijk aan de vraag start een projectontwikkelaar één project.
      const perZone = new Map<Zone, Kavel[]>();
      for (const k of this.kavels.values()) {
        if (k.zone === 'geen' || k.gebouw) continue;
        let l = perZone.get(k.zone); if (!l) perZone.set(k.zone, l = []); l.push(k);
      }
      for (const [zone, lijst] of perZone) {
        const v = this.vraagVoor(zone);
        // Grotere vraag: meerdere projecten tegelijk.
        const pogingen = 1 + Math.floor(v * 2);
        for (let p = 0; p < pogingen && lijst.length; p++) {
          if (this.rng.next() > v) continue;
          const i = Math.floor(this.rng.next() * lijst.length);
          const k = lijst[i]; lijst.splice(i, 1);
          if (!k.gebouw) this.startBouw(k);
        }
      }
    }

    this.statKlok += dtEcht;
    if (this.statKlok >= 0.5) { this.statKlok = 0; this.berekenStatistiek(); }
  }

  berekenStatistiek() {
    let inw = 0, won = 0, d = 0, h = 0, kk = 0, ii = 0, o = 0, klaar = 0, bouw = 0;
    for (const g of this.gebouwen.values()) {
      if (!g.klaar) { bouw++; continue; }
      klaar++;
      const b = g.bezetting, c = g.cap;
      inw += c.bewoners * b; won += c.woningen;
      d += c.banen.detailhandel * b; h += c.banen.horeca * b; kk += c.banen.kantoor * b; ii += c.banen.industrie * b; o += c.banen.overig * b;
    }
    const banen = d + h + kk + ii + o;
    const beroeps = inw * KENGETALLEN.beroepsbevolking;
    const werkenden = Math.min(beroeps, banen);
    const wl = beroeps > 1 ? (beroeps - werkenden) / beroeps : 0;
    this.stat = { inwoners: Math.round(inw), woningen: won, beroeps: Math.round(beroeps), werkenden: Math.round(werkenden), werkloosheid: wl,
      banen: Math.round(banen), banenD: Math.round(d), banenH: Math.round(h), banenK: Math.round(kk), banenI: Math.round(ii), banenO: Math.round(o), gebouwenKlaar: klaar, inAanbouw: bouw };
    const doelD = inw / 12, doelK = beroeps * 0.3, doelI = beroeps * 0.15;
    this.vraag = {
      wonen: saturate(0.55 + (banen - beroeps) / Math.max(150, beroeps + banen) * 1.2 - wl * 1.5),
      detailhandel: saturate(0.1 + (doelD - (d + h)) / Math.max(10, doelD)),
      kantoor: saturate(0.05 + (doelK - kk) / Math.max(25, doelK) + wl),
      industrie: saturate(0.15 + (doelI - ii) / Math.max(25, doelI) + wl),
    };
  }

  // ─── Opslaan (engine-onafhankelijk JSON-formaat) ────────────────────────────

  naarJson() {
    return {
      versie: 1, seed: this.seed, dagen: this.dagen, geld: this.geld, volgende: this.volgende,
      net: this.net.naarJson(),
      kavels: [...this.kavels.values()],
      gebouwen: [...this.gebouwen.values()],
    };
  }
}

export function kavelMidden(k: Kavel): V2 {
  return { x: (k.poly[0].x + k.poly[1].x + k.poly[2].x + k.poly[3].x) / 4, z: (k.poly[0].z + k.poly[1].z + k.poly[2].z + k.poly[3].z) / 4 };
}

function afstandTotPolygoon(p: V2, poly: V2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ab = sub2(b, a), l2 = dot2(ab, ab);
    const t = l2 > 0 ? saturate(dot2(sub2(p, a), ab) / l2) : 0;
    best = Math.min(best, dist2(p, add2(a, mul2(ab, t))));
  }
  return best;
}

function krimpPolygoon(poly: V2[], m: number): V2[] {
  const c = poly.reduce((s, p) => add2(s, p), { x: 0, z: 0 });
  const cm = mul2(c, 1 / poly.length);
  return poly.map(p => { const d = sub2(cm, p); const l = Math.hypot(d.x, d.z) || 1; return add2(p, mul2(d, m / l)); });
}
