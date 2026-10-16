// Hulpfuncties voor het verkeersgereedschap (TM:PE): wegeinden vinden, voorrangsweg maken.
import { V2 } from '../math';
import { Wegennet, Segment } from '../wegen/netwerk';
import { WEGTYPEN } from '../wegen/typen';
import type { Bord } from './regels';

/** Punt op een segment op afstand d van een uiteinde (naar binnen), met de richting van de knoop af. */
export function puntBijEind(net: Wegennet, seg: Segment, knoop: number, d: number): { x: number; y: number; z: number; dx: number; dz: number } {
  const pad = seg.pad, aan = seg.a === knoop;
  const L = seg.lengte, s = aan ? Math.min(d, L * 0.5) : Math.max(L - d, L * 0.5);
  let best = pad[0];
  for (const p of pad) if (Math.abs(p.s - s) < Math.abs(best.s - s)) best = p;
  return { x: best.x, y: best.y, z: best.z, dx: aan ? best.dx : -best.dx, dz: aan ? best.dz : -best.dz };
}

/** Afstand van een kruispunt waarop borden en pijlen staan (net voor de stopstreep). */
export function eindAfstand(net: Wegennet, seg: Segment, knoop: number): number {
  const k = net.eindKnip(seg, seg.a === knoop ? 'a' : 'b');
  return Math.max(k.links, k.rechts) + 6;
}

/** Het wegeinde (segment + kruispunt) dat het dichtst bij p ligt, als dat binnen `max` m is. */
export function wegeindeBij(net: Wegennet, p: V2, max = 22): { seg: number; knoop: number } | null {
  let best: { seg: number; knoop: number } | null = null, bd = max;
  for (const k of net.knopen.values()) {
    if (k.segs.length < 3) continue;
    if (Math.abs(k.p.x - p.x) > 60 || Math.abs(k.p.z - p.z) > 60) continue;
    for (const sid of k.segs) {
      const seg = net.segmenten.get(sid);
      if (!seg) continue;
      const q = puntBijEind(net, seg, k.id, eindAfstand(net, seg, k.id) - 3);
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) { bd = d; best = { seg: sid, knoop: k.id }; }
    }
  }
  return best;
}

/** Kruispunt (graad ≥ 3) bij p. */
export function kruispuntBij(net: Wegennet, p: V2, max = 18): number | null {
  let best: number | null = null, bd = max;
  for (const k of net.knopen.values()) {
    if (k.segs.length < 3) continue;
    const d = Math.hypot(k.p.x - p.x, k.p.z - p.z);
    if (d < bd) { bd = d; best = k.id; }
  }
  return best;
}

/**
 * Voorrangsweg zoals in TM:PE: vanaf het segment de weg zo recht mogelijk volgen (beide kanten op,
 * hoogstens 30° afwijking). Geeft de segmenten van de keten.
 */
export function hoofdwegKeten(net: Wegennet, start: number, max = 80): number[] {
  const keten = [start];
  const gezien = new Set([start]);
  const s0 = net.segmenten.get(start);
  if (!s0) return [];
  for (const eind of [s0.a, s0.b]) {
    let seg: Segment = s0, knoop = eind;
    for (let n = 0; n < max; n++) {
      const k = net.knopen.get(knoop);
      if (!k || k.segs.length < 2) break;
      const inn = net.wegVan(seg, knoop); // van de knoop af, het segment in
      let beste: Segment | null = null, bh = 0.52;
      for (const sid of k.segs) {
        if (sid === seg.id || gezien.has(sid)) continue;
        const s = net.segmenten.get(sid);
        if (!s || WEGTYPEN[s.type].snelheid < 15) continue;
        const uit = net.wegVan(s, knoop);
        // Rechtdoor: tegengesteld aan de richting waarin we binnenkwamen.
        const hoek = Math.acos(Math.max(-1, Math.min(1, -(inn.x * uit.x + inn.z * uit.z))));
        if (hoek < bh) { bh = hoek; beste = s; }
      }
      if (!beste) break;
      gezien.add(beste.id); keten.push(beste.id);
      knoop = beste.a === knoop ? beste.b : beste.a;
      seg = beste;
    }
  }
  return keten;
}

/** Borden langs een voorrangsweg: de weg zelf voorrang, zijwegen voorrang verlenen (of stop). */
export function maakHoofdweg(net: Wegennet, start: number, zij: Bord = 'geef'): number {
  const keten = new Set(hoofdwegKeten(net, start));
  const knopen = new Set<number>();
  for (const id of keten) { const s = net.segmenten.get(id)!; knopen.add(s.a); knopen.add(s.b); }
  let n = 0;
  for (const kid of knopen) {
    const k = net.knopen.get(kid)!;
    if (k.segs.length < 3) continue;
    for (const sid of k.segs) { net.regels.zetEind(sid, kid, { bord: keten.has(sid) ? 'voorrang' : zij }); n++; }
    // Een voorrangsweg heeft geen verkeerslichten nodig.
    if (net.heeftLichten(kid)) net.regels.zetKnoop(kid, { licht: 'uit' });
  }
  return n;
}

/** Alle borden van een kruispunt weghalen. */
export function wisBorden(net: Wegennet, knoop: number) {
  for (const sid of net.knopen.get(knoop)?.segs ?? []) net.regels.zetEind(sid, knoop, { bord: undefined });
}
