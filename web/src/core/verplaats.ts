// ════════════════════════════════════════════════════════════════════════════════════
// VERPLAATSEN (zoals Move It)
// Selecteren (klik, Shift = erbij/eraf, slepen = rechthoek), filters per soort, verplaatsen door
// te slepen of met de pijltjes, draaien, hoogte, wegen buigen en rechttrekken, hoogte uitlijnen,
// kopiëren en plakken, verwijderen, en alles ongedaan maken en opnieuw doen.
// Werkt op knopen en wegen, gebouwen, voorzieningen en bomen. Engine-onafhankelijk.
// ════════════════════════════════════════════════════════════════════════════════════

import { V2, V3, dist2, lerp2, puntInPolygoon, bezier2 } from './math';
import type { Wereld, Gebouw } from './wereld';
import type { Dienst } from './voorzieningen';
import type { WegTypeId } from './wegen/typen';
import { halveBreedte } from './wegen/typen';
import { Wegennet } from './wegen/netwerk';

export type Soort = 'knoop' | 'seg' | 'gebouw' | 'dienst' | 'boom';
export interface Ding { soort: Soort; id: number }
export type Filter = Record<Soort, boolean>;

type Boomstand = { i: number; x: number; z: number; rot: number; levend: boolean };
interface Stand {
  net: ReturnType<Wegennet['naarJson']>;
  gebouwen: Map<number, Gebouw | null>;
  diensten: Map<number, Dienst | null>;
  bomen: Boomstand[];
}
interface Actie { naam: string; voor: Stand; na: Stand }

interface Klembord {
  pivot: V2;
  wegen: { a: V2; c: V2; b: V2; type: WegTypeId; niveau: number }[];
  gebouwen: Gebouw[];
  diensten: Dienst[];
}

const draaiOm = (c: V2, hoek: number) => { const co = Math.cos(hoek), si = Math.sin(hoek); return (p: V2): V2 => ({ x: c.x + (p.x - c.x) * co - (p.z - c.z) * si, z: c.z + (p.x - c.x) * si + (p.z - c.z) * co }); };
const schuif = (d: V2) => (p: V2): V2 => ({ x: p.x + d.x, z: p.z + d.z });

export class Verplaatser {
  sel: Record<Soort, Set<number>> = { knoop: new Set(), seg: new Set(), gebouw: new Set(), dienst: new Set(), boom: new Set() };
  filter: Filter = { knoop: true, seg: true, gebouw: true, dienst: true, boom: true };
  private terugStapel: Actie[] = [];
  private opnieuwStapel: Actie[] = [];
  private klembord: Klembord | null = null;
  /** Telt mee bij elke wijziging (voor de werkbalk). */
  versie = 0;

  constructor(private w: Wereld) {}

  get aantal() { let n = 0; for (const s of Object.values(this.sel)) n += s.size; return n; }
  get leeg() { return this.aantal === 0; }
  get kanTerug() { return this.terugStapel.length > 0; }
  get kanOpnieuw() { return this.opnieuwStapel.length > 0; }
  get heeftKlembord() { return !!this.klembord; }
  naamTerug() { return this.terugStapel[this.terugStapel.length - 1]?.naam ?? ''; }
  naamOpnieuw() { return this.opnieuwStapel[this.opnieuwStapel.length - 1]?.naam ?? ''; }

  // ─── Selecteren ───────────────────────────────────────────────────────────────

  /** Wat ligt er onder p? Knopen eerst (die zijn klein), dan voorzieningen, gebouwen, wegen, bomen. */
  raak(p: V2): Ding | null {
    const w = this.w, f = this.filter;
    if (f.knoop) { const k = w.net.knoopBij(p, 5); if (k) return { soort: 'knoop', id: k.id }; }
    if (f.dienst) { const d = w.voorzieningen.dienstOp(p); if (d) return { soort: 'dienst', id: d.id }; }
    if (f.gebouw) { const g = w.gebouwOp(p); if (g) return { soort: 'gebouw', id: g.id }; }
    if (f.seg) { const s = w.net.segmentBij(p, 0.5); if (s && s.d <= halveBreedte(s.seg.type) + 0.5) return { soort: 'seg', id: s.seg.id }; }
    if (f.boom) { const b = w.bomen.boomBij(p, 3); if (b !== null) return { soort: 'boom', id: b }; }
    return null;
  }

  heeft(d: Ding) { return this.sel[d.soort].has(d.id); }
  wissel(d: Ding) { const s = this.sel[d.soort]; if (s.has(d.id)) s.delete(d.id); else s.add(d.id); this.versie++; }
  kies(d: Ding) { this.leegmaken(); this.sel[d.soort].add(d.id); this.versie++; }
  leegmaken() { for (const s of Object.values(this.sel)) s.clear(); this.versie++; }

  /** Alles (volgens de filters) binnen een polygoon op de grond. */
  inVeld(poly: V2[], erbij: boolean) {
    if (!erbij) this.leegmaken();
    const w = this.w, f = this.filter;
    if (f.knoop) for (const k of w.net.knopen.values()) if (puntInPolygoon(k.p, poly)) this.sel.knoop.add(k.id);
    if (f.seg) for (const s of w.net.segmenten.values()) { const m = s.pad[s.pad.length >> 1]; if (m && puntInPolygoon(m, poly)) this.sel.seg.add(s.id); }
    if (f.gebouw) for (const g of w.gebouwen.values()) if (puntInPolygoon(g.centrum, poly)) this.sel.gebouw.add(g.id);
    if (f.dienst) for (const d of w.voorzieningen.diensten.values()) if (puntInPolygoon(d.p, poly)) this.sel.dienst.add(d.id);
    if (f.boom) for (const i of w.bomen.inPolygoon(poly).slice(0, 4000)) this.sel.boom.add(i);
    this.versie++;
  }

  /** Bestaat alles nog? (na slopen of herbouwen elders) */
  opschonen() {
    const w = this.w;
    for (const id of [...this.sel.knoop]) if (!w.net.knopen.has(id)) this.sel.knoop.delete(id);
    for (const id of [...this.sel.seg]) if (!w.net.segmenten.has(id)) this.sel.seg.delete(id);
    for (const id of [...this.sel.gebouw]) if (!w.gebouwen.has(id)) this.sel.gebouw.delete(id);
    for (const id of [...this.sel.dienst]) if (!w.voorzieningen.diensten.has(id)) this.sel.dienst.delete(id);
    for (const id of [...this.sel.boom]) if (!w.bomen.levend[id]) this.sel.boom.delete(id);
  }

  /** Knopen die meebewegen: de gekozen knopen en de uiteinden van de gekozen wegen. */
  private bewegendeKnopen(): number[] {
    const r = new Set(this.sel.knoop);
    for (const id of this.sel.seg) { const s = this.w.net.segmenten.get(id); if (s) { r.add(s.a); r.add(s.b); } }
    return [...r];
  }

  /** Midden van de selectie (draaipunt). */
  midden(): V2 | null {
    const w = this.w, pts: V2[] = [];
    for (const id of this.bewegendeKnopen()) { const k = w.net.knopen.get(id); if (k) pts.push(k.p); }
    for (const id of this.sel.gebouw) { const g = w.gebouwen.get(id); if (g) pts.push(g.centrum); }
    for (const id of this.sel.dienst) { const d = w.voorzieningen.diensten.get(id); if (d) pts.push(d.p); }
    for (const id of this.sel.boom) pts.push({ x: w.bomen.x[id], z: w.bomen.z[id] });
    if (!pts.length) return null;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    return { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  }

  /** Greep om één weg te buigen: het punt halverwege de bocht. */
  greep(): { seg: number; p: V2 } | null {
    if (this.sel.seg.size !== 1 || this.sel.knoop.size || this.sel.gebouw.size || this.sel.dienst.size) return null;
    const id = [...this.sel.seg][0], s = this.w.net.segmenten.get(id);
    if (!s) return null;
    const A = this.w.net.knopen.get(s.a)!.p, B = this.w.net.knopen.get(s.b)!.p;
    return { seg: id, p: bezier2(A, s.c, B, 0.5) };
  }

  // ─── Ongedaan maken ───────────────────────────────────────────────────────────

  private stand(gebouwIds: Iterable<number>, dienstIds: Iterable<number>, boomIds: number[]): Stand {
    const w = this.w;
    const gebouwen = new Map<number, Gebouw | null>();
    for (const id of gebouwIds) { const g = w.gebouwen.get(id); gebouwen.set(id, g ? structuredClone(g) : null); }
    const diensten = new Map<number, Dienst | null>();
    for (const id of dienstIds) { const d = w.voorzieningen.diensten.get(id); diensten.set(id, d ? structuredClone(d) : null); }
    return { net: JSON.parse(JSON.stringify(w.net.naarJson())), gebouwen, diensten, bomen: w.bomen.stand(boomIds) };
  }

  /** Een bewerking uitvoeren en vastleggen voor ongedaan maken. */
  private actie(naam: string, extraGebouwen: number[], fn: () => void) {
    const w = this.w;
    const gIds = new Set([...this.sel.gebouw, ...extraGebouwen]);
    const dVoor = new Set(w.voorzieningen.diensten.keys());
    const gVoor = new Set(w.gebouwen.keys());
    const bomen = [...this.sel.boom];
    const voor = this.stand(gIds, dVoor, bomen);
    w.opname = new Map();
    try { fn(); } finally {
      const opname = w.opname;
      w.opname = null;
      // Gebouwen die tijdens de bewerking verdwenen (weg verlegd) of erbij kwamen (plakken).
      for (const [id, g] of opname) { gIds.add(id); voor.gebouwen.set(id, g); }
      for (const id of w.gebouwen.keys()) if (!gVoor.has(id)) { gIds.add(id); voor.gebouwen.set(id, null); }
      const dIds = new Set([...dVoor, ...w.voorzieningen.diensten.keys()]);
      for (const id of dIds) if (!voor.diensten.has(id)) voor.diensten.set(id, null);
      const na = this.stand(gIds, dIds, bomen);
      this.terugStapel.push({ naam, voor, na });
      if (this.terugStapel.length > 60) this.terugStapel.shift();
      this.opnieuwStapel = [];
      this.versie++;
    }
  }

  private zetStand(s: Stand) {
    const w = this.w;
    w.net.zetStand(s.net);
    w.werkNetBij();
    for (const [id, g] of s.gebouwen) { if (g) w.zetGebouw(g); else if (w.gebouwen.has(id)) w.verwijderGebouw(id); }
    for (const [id, d] of s.diensten) { if (d) w.voorzieningen.zet(d); else w.voorzieningen.haalWeg(id); }
    w.bomen.zetStand(s.bomen);
    this.opschonen();
    this.versie++;
  }

  terug(): string | null {
    const a = this.terugStapel.pop();
    if (!a) return null;
    this.zetStand(a.voor);
    this.opnieuwStapel.push(a);
    return a.naam;
  }
  opnieuw(): string | null {
    const a = this.opnieuwStapel.pop();
    if (!a) return null;
    this.zetStand(a.na);
    this.terugStapel.push(a);
    return a.naam;
  }

  // ─── Bewerkingen ──────────────────────────────────────────────────────────────

  /** Alles in de selectie volgens f (punten) en drot (draaiing), plus dy omhoog. */
  private transformeer(naam: string, f: (p: V2) => V2, drot: number, dy: number): boolean {
    if (this.leeg) return false;
    const w = this.w;
    let ok = true;
    this.actie(naam, [], () => {
      const knopen = this.bewegendeKnopen();
      if (knopen.length) {
        ok = w.net.transformeer(knopen, f, dy, [...this.sel.seg]);
        if (ok) w.werkNetBij();
      }
      if (!ok) return;
      for (const id of this.sel.gebouw) w.transformeerGebouw(id, f, drot, dy);
      for (const id of this.sel.dienst) w.voorzieningen.transformeer(id, f, drot);
      for (const i of this.sel.boom) { const q = f({ x: w.bomen.x[i], z: w.bomen.z[i] }); w.bomen.verplaats(i, q.x, q.z, w.bomen.rot[i] + drot); }
    });
    if (!ok) { this.terugStapel.pop(); return false; }
    this.opschonen();
    return true;
  }

  verschuif(d: V2, dy = 0) { return this.transformeer(dy ? 'Hoogte' : 'Verplaatsen', schuif(d), 0, dy); }
  draai(hoek: number) { const c = this.midden(); return c ? this.transformeer('Draaien', draaiOm(c, hoek), hoek, 0) : false; }
  hoogte(dy: number) { return this.transformeer('Hoogte', p => p, 0, dy); }

  /** Weg buigen: het punt halverwege de bocht naar p. */
  buig(seg: number, p: V2) {
    const s = this.w.net.segmenten.get(seg);
    if (!s) return;
    const A = this.w.net.knopen.get(s.a)!.p, B = this.w.net.knopen.get(s.b)!.p;
    const c = { x: 2 * p.x - (A.x + B.x) / 2, z: 2 * p.z - (A.z + B.z) / 2 };
    this.actie('Weg buigen', [], () => { this.w.net.buig(seg, c); this.w.werkNetBij(); });
  }

  /** Gekozen wegen (en wegen tussen gekozen knopen) recht maken. */
  rechttrekken() {
    const net = this.w.net, ids = new Set(this.sel.seg);
    for (const s of net.segmenten.values()) if (this.sel.knoop.has(s.a) && this.sel.knoop.has(s.b)) ids.add(s.id);
    if (!ids.size) return false;
    this.actie('Rechttrekken', [], () => {
      for (const id of ids) { const s = net.segmenten.get(id)!; net.buig(id, lerp2(net.knopen.get(s.a)!.p, net.knopen.get(s.b)!.p, 0.5)); }
      this.w.werkNetBij();
    });
    return true;
  }

  /** Alle gekozen knopen op dezelfde hoogte (de gemiddelde hoogte), zoals 'Align Height'. */
  hoogteUitlijnen() {
    const net = this.w.net, ids = this.bewegendeKnopen();
    if (ids.length < 2) return false;
    const y = ids.reduce((s, id) => s + net.knopen.get(id)!.y, 0) / ids.length;
    this.actie('Hoogte uitlijnen', [], () => {
      for (const id of ids) { const k = net.knopen.get(id)!; k.niveau = Math.round((y - net.knoopHoogte(k.p)) * 10) / 10; }
      net.transformeer(ids, p => p, 0);
      this.w.werkNetBij();
    });
    return true;
  }

  /** Selectie weghalen (wegen worden gesloopt zoals met de bulldozer). */
  verwijder() {
    if (this.leeg) return false;
    const w = this.w, net = w.net;
    const segs = new Set(this.sel.seg);
    for (const id of this.sel.knoop) for (const s of net.knopen.get(id)?.segs ?? []) segs.add(s);
    this.actie('Verwijderen', [...this.sel.gebouw], () => {
      for (const id of segs) if (net.segmenten.has(id)) w.sloopWeg(id);
      for (const id of this.sel.gebouw) w.verwijderGebouw(id);
      for (const id of this.sel.dienst) w.voorzieningen.sloop(id);
      w.bomen.zetLevend([...this.sel.boom], false);
    });
    this.leegmaken();
    return true;
  }

  kopieer() {
    const w = this.w, net = w.net, c = this.midden();
    if (!c) return false;
    const segs = new Set(this.sel.seg);
    for (const s of net.segmenten.values()) if (this.sel.knoop.has(s.a) && this.sel.knoop.has(s.b)) segs.add(s.id);
    this.klembord = {
      pivot: c,
      wegen: [...segs].map(id => { const s = net.segmenten.get(id)!, A = net.knopen.get(s.a)!, B = net.knopen.get(s.b)!; return { a: { ...A.p }, c: { ...s.c }, b: { ...B.p }, type: s.type, niveau: Math.max(A.niveau, B.niveau) }; }),
      gebouwen: [...this.sel.gebouw].map(id => structuredClone(w.gebouwen.get(id)!)).filter(Boolean),
      diensten: [...this.sel.dienst].map(id => structuredClone(w.voorzieningen.diensten.get(id)!)).filter(Boolean),
    };
    return true;
  }

  /** Klembord neerzetten met het midden op p, gedraaid over `hoek`. Kost wat de wegen en voorzieningen kosten. */
  plak(p: V2, hoek = 0): string | null {
    const kb = this.klembord;
    if (!kb) return 'Niets gekopieerd';
    const w = this.w;
    const draai = draaiOm(kb.pivot, hoek), d = { x: p.x - kb.pivot.x, z: p.z - kb.pivot.z };
    const f = (q: V2) => { const r = draai(q); return { x: r.x + d.x, z: r.z + d.z }; };
    let fout: string | null = null;
    const voorG = new Set(w.gebouwen.keys()), voorD = new Set(w.voorzieningen.diensten.keys());
    this.actie('Plakken', [], () => {
      for (const x of kb.wegen) { const r = w.legWeg(f(x.a), f(x.c), f(x.b), x.type, x.niveau); if (!r.ok) fout = r.fout ?? 'Een weg past hier niet'; }
      for (const g of kb.gebouwen) w.plakGebouw(g, f, hoek);
      for (const dd of kb.diensten) w.voorzieningen.plak(dd, f, hoek);
    });
    // De geplakte dingen worden de nieuwe selectie (meteen verder schuiven of draaien).
    this.leegmaken();
    for (const id of w.gebouwen.keys()) if (!voorG.has(id)) this.sel.gebouw.add(id);
    for (const id of w.voorzieningen.diensten.keys()) if (!voorD.has(id)) this.sel.dienst.add(id);
    return fout;
  }

  /** Spooklijnen van de selectie na f (voor het voorbeeld tijdens slepen of plakken). */
  geest(f: (p: V2) => V2, y: (p: V2) => number, klembord = false): [V3, V3][] {
    const w = this.w, l: [V3, V3][] = [];
    const v3 = (p: V2): V3 => ({ x: p.x, y: y(p) + 0.8, z: p.z });
    const ring = (pts: V2[], h = 0) => {
      for (let i = 0; i < pts.length; i++) {
        const a = v3(f(pts[i])), b = v3(f(pts[(i + 1) % pts.length]));
        l.push([a, b]);
        if (h > 0) { const a2 = { ...a, y: a.y + h }, b2 = { ...b, y: b.y + h }; l.push([a2, b2], [a, a2]); }
      }
    };
    const hoogte = (g: Gebouw) => g.lagen.reduce((s, x) => s + x.hoogte, 0);
    const lijn = (pts: V2[]) => { for (let i = 1; i < pts.length; i++) l.push([v3(f(pts[i - 1])), v3(f(pts[i]))]); };
    if (klembord && this.klembord) {
      for (const x of this.klembord.wegen) lijn(Wegennet.curve(x.a, x.c, x.b, 16));
      for (const g of this.klembord.gebouwen) ring(g.voet, hoogte(g));
      for (const d of this.klembord.diensten) ring(d.voet);
      return l;
    }
    const net = w.net, knopen = new Set(this.bewegendeKnopen());
    const segs = new Set(this.sel.seg);
    for (const id of knopen) for (const s of net.knopen.get(id)?.segs ?? []) segs.add(s);
    for (const id of segs) {
      const s = net.segmenten.get(id);
      if (!s) continue;
      const A = net.knopen.get(s.a)!.p, B = net.knopen.get(s.b)!.p;
      const aM = knopen.has(s.a), bM = knopen.has(s.b);
      const A1 = aM ? f(A) : A, B1 = bM ? f(B) : B;
      const c = (aM && bM) || this.sel.seg.has(id) ? f(s.c) : dist2(s.c, lerp2(A, B, 0.5)) < 0.6 ? lerp2(A1, B1, 0.5) : { x: s.c.x + ((aM ? A1.x - A.x : B1.x - B.x) / 2), z: s.c.z + ((aM ? A1.z - A.z : B1.z - B.z) / 2) };
      const pts = Wegennet.curve(A1, c, B1, 16);
      for (let i = 1; i < pts.length; i++) l.push([v3(pts[i - 1]), v3(pts[i])]);
    }
    for (const id of this.sel.gebouw) { const g = w.gebouwen.get(id); if (g) ring(g.voet, hoogte(g)); }
    for (const id of this.sel.dienst) { const d = w.voorzieningen.diensten.get(id); if (d) ring(d.voet); }
    for (const i of [...this.sel.boom].slice(0, 300)) { const p = { x: w.bomen.x[i], z: w.bomen.z[i] }; ring([0, 1, 2, 3, 4, 5].map(k => ({ x: p.x + Math.cos(k * 1.047) * 1.6, z: p.z + Math.sin(k * 1.047) * 1.6 }))); }
    return l;
  }

  /** Spooklijnen van het klembord met het midden op p, gedraaid over `hoek`. */
  geestKlembord(p: V2, hoek: number, y: (p: V2) => number): [V3, V3][] {
    const kb = this.klembord;
    if (!kb) return [];
    const draai = draaiOm(kb.pivot, hoek), d = { x: p.x - kb.pivot.x, z: p.z - kb.pivot.z };
    return this.geest(q => { const r = draai(q); return { x: r.x + d.x, z: r.z + d.z }; }, y, true);
  }

  static schuif = schuif;
  static draaiOm = draaiOm;
}
