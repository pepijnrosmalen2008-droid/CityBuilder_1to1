// Voegt de onderdelen van een vak (wegen, gebouwen, bedrijven) samen tot kant-en-klare buffers,
// buiten de hoofdthread. De worker houdt zelf per niveau en vak de onderdelen bij; de hoofdthread
// stuurt alleen wijzigingen en krijgt per vak de geometrie terug (overdraagbare arrays, geen kopie).

import { samenvoegen, MeshData } from '../core/geom/mesh';
import { effenSamen, vereenvoudig } from '../core/geom/lod';
import { materiaal } from '../core/materialen';

export type Niv = 'dicht' | 'ver';
export interface VakGeometrie {
  pos: Float32Array; nrm: Float32Array; uv: Float32Array; idx: Uint32Array;
  kl: Float32Array | null; la: Float32Array | null; rm: Float32Array | null;
  groepen: { start: number; aantal: number; materiaal: string }[];
  schaduw: { pos: Float32Array; idx: Uint32Array } | null;
}
export type NaarWorker =
  | { t: 'zet'; k: string; vakD: number; vakV: number; data: MeshData; ver: MeshData | null }
  | { t: 'wis'; k: string }
  | { t: 'bouw'; niv: Niv; vak: number; nr: number };
export interface VanWorker { nr: number; niv: Niv; vak: number; geo: VakGeometrie | null }

const bron: Record<Niv, Map<string, { vak: number; data: MeshData }>> = { dicht: new Map(), ver: new Map() };
const inhoud: Record<Niv, Map<number, Set<string>>> = { dicht: new Map(), ver: new Map() };

function zetIn(niv: Niv, k: string, vak: number, data: MeshData) {
  bron[niv].set(k, { vak, data });
  let s = inhoud[niv].get(vak); if (!s) inhoud[niv].set(vak, s = new Set()); s.add(k);
}
function wis(k: string) {
  for (const niv of ['dicht', 'ver'] as Niv[]) {
    const b = bron[niv].get(k);
    if (!b) continue;
    bron[niv].delete(k); inhoud[niv].get(b.vak)?.delete(k);
  }
}

function bouw(niv: Niv, vak: number): VakGeometrie | null {
  const delen = [...(inhoud[niv].get(vak) ?? [])].map(k => bron[niv].get(k)!.data);
  if (!delen.length) return null;
  const data = niv === 'dicht' ? effenSamen(samenvoegen(delen)) : samenvoegen(delen);
  if (!data.groepen.length) return null;
  let nv = 0, ni = 0;
  for (const g of data.groepen) { nv += g.posities.length / 3; ni += g.indices.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  const kl = data.groepen.some(g => g.kleuren) ? new Float32Array(nv * 3).fill(1) : null;
  const la = data.groepen.some(g => g.lagen) ? new Float32Array(nv) : null;
  const rm = data.groepen.some(g => g.rm) ? new Float32Array(nv * 2).fill(0.8) : null;
  const groepen: VakGeometrie['groepen'] = [];
  let ov = 0, oi = 0;
  // Schaduwvervanger: alle schaduwwerpende, niet-doorzichtige driehoeken als één lijst.
  let sv = 0, si = 0;
  const werpt = data.groepen.map(g => { const d = materiaal(g.materiaal); return g.materiaal === 'atlasVer' || g.materiaal === 'kleurVer' || (d.schaduw !== false && d.alfa === undefined); });
  data.groepen.forEach((g, k) => { if (werpt[k]) { sv += g.posities.length / 3; si += g.indices.length; } });
  const sPos = new Float32Array(sv * 3), sIdx = new Uint32Array(si);
  let sov = 0, soi = 0;
  data.groepen.forEach((g, k) => {
    pos.set(g.posities, ov * 3); nrm.set(g.normalen, ov * 3); uv.set(g.uvs, ov * 2);
    if (kl && g.kleuren) kl.set(g.kleuren, ov * 3);
    if (la && g.lagen) la.set(g.lagen, ov);
    if (rm && g.rm) rm.set(g.rm, ov * 2);
    for (let i = 0; i < g.indices.length; i++) idx[oi + i] = g.indices[i] + ov;
    groepen.push({ start: oi, aantal: g.indices.length, materiaal: g.materiaal });
    if (werpt[k]) {
      sPos.set(g.posities, sov * 3);
      for (let i = 0; i < g.indices.length; i++) sIdx[soi + i] = g.indices[i] + sov;
      sov += g.posities.length / 3; soi += g.indices.length;
    }
    ov += g.posities.length / 3; oi += g.indices.length;
  });
  return { pos, nrm, uv, idx, kl, la, rm, groepen, schaduw: si ? { pos: sPos, idx: sIdx } : null };
}

self.onmessage = (e: MessageEvent<NaarWorker>) => {
  const m = e.data;
  if (m.t === 'zet') {
    wis(m.k);
    zetIn('dicht', m.k, m.vakD, m.data);
    const v = vereenvoudig(m.ver ?? m.data);
    if (v.groepen.length) zetIn('ver', m.k, m.vakV, v);
  } else if (m.t === 'wis') wis(m.k);
  else {
    const geo = bouw(m.niv, m.vak);
    const r: VanWorker = { nr: m.nr, niv: m.niv, vak: m.vak, geo };
    const lijst: Transferable[] = [];
    if (geo) {
      for (const a of [geo.pos, geo.nrm, geo.uv, geo.idx, geo.kl, geo.la, geo.rm]) if (a) lijst.push(a.buffer);
      if (geo.schaduw) lijst.push(geo.schaduw.pos.buffer, geo.schaduw.idx.buffer);
    }
    (self as unknown as Worker).postMessage(r, lijst);
  }
};
