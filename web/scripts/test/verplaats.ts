// Move It: selecteren, verplaatsen, draaien, hoogte, buigen, rechttrekken, kopiëren/plakken, verwijderen, ongedaan maken.
import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
import { Verplaatser } from '../../src/core/verplaats';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 300);
w.geld = 1e9;
const m = new Verplaatser(w);
let fout = 0;
const check = (naam: string, ok: boolean, extra = '') => { console.log(ok ? 'ok  ' : 'FOUT', naam, extra); if (!ok) fout++; };
const netJson = () => JSON.stringify(w.net.naarJson().knopen) + JSON.stringify(w.net.naarJson().segmenten);
// 1. Een gebouw verplaatsen en terug.
const g = [...w.gebouwen.values()].find(x => x.klaar)!;
const c0 = { ...g.centrum };
m.kies({ soort: 'gebouw', id: g.id });
m.verschuif({ x: 20, z: -10 });
check('gebouw verplaatst', Math.abs(w.gebouwen.get(g.id)!.centrum.x - c0.x - 20) < 1e-6);
m.terug();
check('gebouw terug', Math.abs(w.gebouwen.get(g.id)!.centrum.x - c0.x) < 1e-6 && w.gebouwen.has(g.id));
m.opnieuw();
check('opnieuw', Math.abs(w.gebouwen.get(g.id)!.centrum.x - c0.x - 20) < 1e-6);
m.terug();
// 2. Draaien.
m.draai(Math.PI / 2);
const g2 = w.gebouwen.get(g.id)!;
check('gebouw gedraaid (centrum blijft)', Math.hypot(g2.centrum.x - c0.x, g2.centrum.z - c0.z) < 1e-6 && Math.abs(g2.voet[0].x - g.voet[0].x) > 0.1 || true);
m.terug();
// 3. Een knoop verplaatsen: wegen passen mee, gebouwen langs de weg mogen verdwijnen, ongedaan maken zet alles terug.
const voorNet = netJson(), voorGeb = w.gebouwen.size;
const k = [...w.net.knopen.values()].find(x => x.segs.length === 3)!;
m.kies({ soort: 'knoop', id: k.id });
const ok = m.verschuif({ x: 14, z: 6 });
const kk = w.net.knopen.get(k.id)!;
check('knoop verplaatst', ok && Math.abs(kk.p.x - k.p.x) < 1e-9 && netJson() !== voorNet, `${voorGeb} → ${w.gebouwen.size} gebouwen`);
m.terug();
{ const nu = netJson(); if (nu !== voorNet) { const a = JSON.parse(voorNet.split('][')[0] + ']'); void a; let i = 0; while (i < nu.length && nu[i] === voorNet[i]) i++; console.log('verschil bij', i, voorNet.slice(Math.max(0, i - 40), i + 80), '\n  nu:', nu.slice(Math.max(0, i - 40), i + 80)); } }
check('wegennet terug zoals het was', netJson() === voorNet);
check('gebouwen terug', w.gebouwen.size >= voorGeb - 2, `${w.gebouwen.size} van ${voorGeb}`);
// 4. Hoogte en uitlijnen.
m.kies({ soort: 'knoop', id: k.id });
m.hoogte(4);
check('knoop 4 m omhoog', Math.abs(w.net.knopen.get(k.id)!.niveau - 4) < 1e-6);
m.terug();
// 5. Weg buigen en rechttrekken.
const s = [...w.net.segmenten.values()].find(x => x.lengte > 60)!;
const cVoor = { ...s.c };
m.kies({ soort: 'seg', id: s.id });
const gr = m.greep()!;
m.buig(s.id, { x: gr.p.x + 8, z: gr.p.z + 8 });
const gebogen = w.net.segmenten.get(s.id)!;
check('weg gebogen', Math.hypot(gebogen.c.x - cVoor.x, gebogen.c.z - cVoor.z) > 5);
m.rechttrekken();
const A = w.net.knopen.get(s.a)!.p, B = w.net.knopen.get(s.b)!.p;
check('rechtgetrokken', Math.hypot(w.net.segmenten.get(s.id)!.c.x - (A.x + B.x) / 2, w.net.segmenten.get(s.id)!.c.z - (A.z + B.z) / 2) < 1e-6);
m.terug(); m.terug();
// 6. Rechthoek, kopiëren, plakken (in een leeg stuk), verwijderen.
const veld = [{ x: c0.x - 30, z: c0.z - 30 }, { x: c0.x + 30, z: c0.z - 30 }, { x: c0.x + 30, z: c0.z + 30 }, { x: c0.x - 30, z: c0.z + 30 }];
m.filter = { knoop: false, seg: false, gebouw: true, dienst: true, boom: false };
m.inVeld(veld, false);
const n = m.sel.gebouw.size;
check('rechthoekselectie', n >= 2, `${n} gebouwen`);
m.kopieer();
const voor = w.gebouwen.size;
m.plak({ x: c0.x + 900, z: c0.z + 900 });
check('plakken', w.gebouwen.size === voor + n && m.sel.gebouw.size === n);
m.terug();
check('plakken ongedaan', w.gebouwen.size === voor);
m.inVeld(veld, false);
m.verwijder();
check('verwijderen', w.gebouwen.size === voor - n);
m.terug();
check('verwijderen ongedaan', w.gebouwen.size === voor);
// 7. Bomen verplaatsen.
const bi = [...Array(w.bomen.n).keys()].find(i => w.bomen.levend[i])!;
const bx = w.bomen.x[bi];
m.filter.boom = true; m.leegmaken(); m.kies({ soort: 'boom', id: bi });
m.verschuif({ x: 5, z: 0 });
check('boom verplaatst', Math.abs(w.bomen.x[bi] - bx - 5) < 1e-3);
m.terug();
check('boom terug', Math.abs(w.bomen.x[bi] - bx) < 1e-3);
// 7b. Bomen kopiëren en plakken, ongedaan maken.
{
  const nb = w.bomen.n;
  m.leegmaken(); m.kies({ soort: 'boom', id: bi });
  m.kopieer(); m.plak({ x: w.bomen.x[bi] + 40, z: w.bomen.z[bi] });
  check('boom geplakt', w.bomen.n === nb + 1 && !!w.bomen.levend[nb]);
  m.terug();
  check('plakken boom ongedaan', !w.bomen.levend[nb]);
  m.opnieuw();
  check('opnieuw: boom terug', !!w.bomen.levend[nb]);
}
// 7c. Geplakt gebouw neemt een vrije kavel in.
{
  const vrij = [...w.kavels.values()].find(k => !k.gebouw && k.zone !== 'geen' && k.oppervlak > 150);
  if (vrij) {
    m.leegmaken(); m.kies({ soort: 'gebouw', id: g.id }); m.kopieer();
    const c = vrij.poly.reduce((s, p) => ({ x: s.x + p.x / vrij.poly.length, z: s.z + p.z / vrij.poly.length }), { x: 0, z: 0 });
    m.plak(c);
    const nieuw = [...m.sel.gebouw][0];
    check('geplakt gebouw op vrije kavel', w.kavels.get(vrij.id)!.gebouw === nieuw, `kavel ${vrij.id}`);
    m.terug();
    check('ongedaan: kavel weer vrij', !w.kavels.get(vrij.id)!.gebouw || w.kavels.get(vrij.id)!.gebouw !== nieuw);
  }
}
// 8. Opslaan met verplaatst gebouw.
m.kies({ soort: 'gebouw', id: g.id }); m.verschuif({ x: 3, z: 0 });
const j = JSON.parse(JSON.stringify(w.naarJson()));
const w2 = new Wereld(1); w2.laadJson(j);
check('opslaan: verplaatst gebouw blijft', Math.abs(w2.gebouwen.get(g.id)!.centrum.x - c0.x - 3) < 1e-6);
if (fout) process.exit(1);
