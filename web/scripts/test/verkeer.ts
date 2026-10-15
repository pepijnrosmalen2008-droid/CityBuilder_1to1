// Verkeerssimulatie zonder browser: voorbeeldstad, 5 minuten verkeer, meten.
import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
const w = new Wereld(1);
bouwVoorbeeldstad(w, Number(process.argv[2] ?? 600));
const vk = w.verkeer;
vk.max = 500;
const t0 = Date.now();
let tijd = 0, ms = 0;
for (let i = 0; i < 300 * 20; i++) {
  const a = performance.now();
  vk.stap(0.05);
  ms += performance.now() - a;
  tijd += 0.05;
  if (i % 1200 === 0 || i === 300 * 20 - 1) {
    const vs = [...vk.voertuigen.values()];
    const stil = vs.filter(v => v.v < 0.3).length;
    const sp = vk.stroken;
    console.log(`t=${tijd.toFixed(0)}s voertuigen ${vs.length} stil ${stil} ritten ${vk.ritten} doorstroming ${(vk.doorstroming * 100).toFixed(0)}% | stroken ${[...sp.sporen.values()].filter(s => s.soort === 'baan').length} verbindingen ${[...sp.sporen.values()].filter(s => s.soort === 'verbinding').length} lichten ${sp.lichten.size} | ${(ms / (i + 1)).toFixed(2)} ms/stap`);
  }
}
// Controle: rijdt iedereen binnen zijn strook en tegen niemand aan?
let botsing = 0;
for (const sp of vk.stroken.sporen.values()) {
  const vs = sp.op.map(id => vk.voertuigen.get(id)!).filter(Boolean).sort((a, b) => a.s - b.s);
  for (let i = 1; i < vs.length; i++) if (vs[i].s - vs[i].lengte - vs[i - 1].s < -0.5) botsing++;
}
const vast = [...vk.voertuigen.values()].filter(v => v.vast > 10).length;
console.log('overlappende voertuigen', botsing, '| lang vast', vast, '| totaal', ((Date.now() - t0) / 1000).toFixed(1), 's');
// Waarom staan ze stil?
const reden = new Map<string, number>();
const tel = (k: string) => reden.set(k, (reden.get(k) ?? 0) + 1);
for (const v of vk.voertuigen.values()) {
  if (v.v > 0.3) continue;
  const sp = vk.stroken.sporen.get(v.spoor)!;
  if (sp.soort === 'verbinding') { tel('op kruispunt'); continue; }
  const i = sp.op.indexOf(v.id);
  const voor = sp.op.slice(i + 1).map(id => vk.voertuigen.get(id)).find(Boolean);
  if (voor && voor.s - voor.lengte - v.s < 8) { tel('achter voorligger'); continue; }
  if (v.ri >= v.route.length - 1) { tel(`op bestemming? rest ${(v.doelS - v.s).toFixed(0)}`); continue; }
  const rest = sp.lengte - v.s;
  const next = v.route[v.ri + 1];
  const c = sp.uit.map(u => vk.stroken.verbinding(u)!).find(c => c.doelSeg === next.seg);
  if (!c) { tel('verkeerde strook'); continue; }
  const licht = vk.stroken.lichtVoor(c.knoop, c.bron);
  if (licht === 'rood' || licht === 'oranje') { tel('rood licht'); continue; }
  if (rest > 15) { tel(`stil midden op strook (rest ${rest.toFixed(0)}, leeftijd ${v.leeftijd.toFixed(0)})`); continue; }
  const bezet = c.conflict.filter(x => (vk.stroken.verbinding(x)?.bezet ?? 0) > 0).length;
  tel(bezet ? 'wacht op kruisend verkeer' : v.res ? 'gereserveerd maar staat' : 'wacht op voorrang/ruimte');
}
console.log([...reden.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}× ${k}`).join('\n'));
// De langste rijen: wat staat er vooraan?
const rijen = [...vk.stroken.sporen.values()].filter(s => s.soort === 'baan').map(s => ({ s, stil: s.op.map(id => vk.voertuigen.get(id)).filter(v => v && v.v < 0.3).length })).sort((a, b) => b.stil - a.stil).slice(0, 6);
for (const { s, stil } of rijen) {
  const b = s as any;
  const kop = s.op.map(id => vk.voertuigen.get(id)!).filter(Boolean).pop()!;
  const seg = w.net.segmenten.get(b.seg)!;
  const next = kop.route[kop.ri + 1];
  const c = next ? b.uit.map((u: number) => vk.stroken.verbinding(u)!).find((c: any) => c.doelSeg === next.seg) : null;
  const doel = c ? vk.stroken.baan(c.naar)! : null;
  const doelStil = doel ? doel.op.map((id: number) => vk.voertuigen.get(id)).filter((v: any) => v && v.v < 0.3).length : -1;
  console.log(`strook ${s.id} (${seg.type} ${seg.naam} ${b.richting}${b.index}/${b.aantal}) lengte ${s.lengte.toFixed(0)} stil ${stil}/${s.op.length} | kop: rest ${(s.lengte - kop.s).toFixed(1)} v ${kop.v.toFixed(1)} res ${kop.res} wacht ${kop.wacht.toFixed(0)} laatste ${kop.ri >= kop.route.length - 1} | volgende ${c ? c.afslag + ' bezet ' + c.bezet + ' licht ' + vk.stroken.lichtVoor(c.knoop, c.bron) + ' doelstrook stil ' + doelStil + '/' + doel!.op.length : 'geen'}`);
}
// Klopt de bezetting van de verbindingen?
let lek = 0;
for (const sp of vk.stroken.sporen.values()) {
  if (sp.soort !== 'verbinding') continue;
  const echt = [...vk.voertuigen.values()].filter(v => v.spoor === sp.id || v.res === sp.id).length;
  if (echt !== sp.bezet) lek++;
}
console.log('verbindingen met verkeerde bezetting', lek);
for (const id of [162, 130]) {
  const s = vk.stroken.sporen.get(id) as any; if (!s) continue;
  const kop = s.op.map((i: number) => vk.voertuigen.get(i)!).filter(Boolean).pop()!;
  const next = kop.route[kop.ri + 1];
  const c = s.uit.map((u: number) => vk.stroken.verbinding(u)!).find((c: any) => c.doelSeg === next.seg);
  const doel = vk.stroken.baan(c.naar)!;
  const eerste = doel.op.map(i => vk.voertuigen.get(i)).find(Boolean);
  console.log(`-- strook ${id}: doel ${doel.id} lengte ${doel.lengte.toFixed(0)} eerste s ${eerste?.s.toFixed(1)} v ${eerste?.v.toFixed(1)} lengte ${eerste?.lengte} laatste? ${eerste ? eerste.ri >= eerste.route.length - 1 : '-'} doelS ${eerste?.doelS.toFixed(0)}`);
  console.log('   conflicten bezet:', c.conflict.map((x: number) => vk.stroken.verbinding(x)!.bezet).join(','), '| aangemeld:', c.conflict.map((x: number) => ((vk as any).aangemeld.get(x) ?? []).length).join(','), '| mag:', (vk as any).mag(kop, c, 0.8));
}
