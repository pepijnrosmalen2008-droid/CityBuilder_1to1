// Verkeersregels (TM:PE): pijlen, keren, lichten, borden, snelheid, verboden, opslaan.
import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 600);
const vk = w.verkeer, net = w.net, R = net.regels;
w.snelheid = 1; vk.max = 500;
vk.stap(0.1);
let fout = 0;
const check = (naam: string, ok: boolean, extra = '') => { console.log(ok ? 'ok  ' : 'FOUT', naam, extra); if (!ok) fout++; };
const tel = (k: number, f: (c: any) => boolean) => [...vk.stroken.sporen.values()].filter(c => c.soort === 'verbinding' && c.knoop === k && f(c)).length;
// Een kruispunt met 4 armen.
const knoop = [...net.knopen.values()].find(k => k.segs.length === 4 && !vk.stroken.lichten.has(k.id))!;
const inSeg = knoop.segs.find(s => vk.stroken.afslagen.has(`${s}:${knoop.id}`))!;
const af = vk.stroken.afslagen.get(`${inSeg}:${knoop.id}`)!;
console.log('kruispunt', knoop.id, 'arm', inSeg, 'mogelijk', af.mogelijk.join(','), 'per strook', JSON.stringify(af.perStrook));
const links0 = tel(knoop.id, c => c.bron === inSeg && c.afslag === 'links');
for (let i = 0; i < af.perStrook.length; i++) R.zetPijlen(inSeg, knoop.id, i, af.perStrook[i].filter(a => a !== 'links'));
vk.stap(0.1);
check('pijlen: linksaf verboden', links0 > 0 && tel(knoop.id, c => c.bron === inSeg && c.afslag === 'links') === 0);
R.wisPijlen(inSeg, knoop.id); vk.stap(0.1);
check('pijlen terug naar standaard', tel(knoop.id, c => c.bron === inSeg && c.afslag === 'links') === links0);
// Keren.
R.zetEind(inSeg, knoop.id, { keren: true }); vk.stap(0.1);
check('keren toegestaan', tel(knoop.id, c => c.bron === inSeg && c.afslag === 'keer') > 0);
R.zetEind(inSeg, knoop.id, { keren: false }); vk.stap(0.1);
check('keren weer uit', tel(knoop.id, c => c.bron === inSeg && c.afslag === 'keer') === 0 && !R.eind.size);
// Lichten aan en uit.
R.zetKnoop(knoop.id, { licht: 'aan', groen: 25 }); vk.stap(0.1);
check('lichten aan', vk.stroken.lichten.get(knoop.id)?.groen === 25);
R.zetKnoop(knoop.id, { licht: 'uit' }); vk.stap(0.1);
check('lichten uit', !vk.stroken.lichten.has(knoop.id));
const metLicht = [...vk.stroken.lichten.keys()][0];
R.zetKnoop(metLicht, { licht: 'uit' }); vk.stap(0.1);
check('automatische lichten uitgezet', !vk.stroken.lichten.has(metLicht));
R.zetKnoop(metLicht, { licht: 'auto' }); R.zetKnoop(knoop.id, { licht: 'auto', groen: undefined }); vk.stap(0.1);
check('automatisch terug', vk.stroken.lichten.has(metLicht) && !R.knoop.size);
// Rijstrookverbinder: strook 0 van de arm alleen naar één doel.
{
  const doelSeg = knoop.segs.find(x => x !== inSeg)!;
  R.zetVerbinder(inSeg, knoop.id, 0, [{ seg: doelSeg, index: 0 }]);
  vk.stap(0.1);
  const r = inSeg === undefined ? 'A' : (net.segmenten.get(inSeg)!.b === knoop.id ? 'A' : 'B');
  const baan = vk.stroken.stroken(inSeg, r)[0];
  const uit = baan.uit.map(id => vk.stroken.verbinding(id)!);
  check('verbinder: precies één verbinding', uit.length === 1 && uit[0].doelSeg === doelSeg, uit.map(c => c.doelSeg).join(','));
  R.zetVerbinder(inSeg, knoop.id, 0, null); vk.stap(0.1);
  check('verbinder weg: standaard terug', vk.stroken.stroken(inSeg, r)[0].uit.length > 1);
}
// Eigen lichtfasen.
{
  const [a, b, ...rest] = knoop.segs;
  R.zetKnoop(knoop.id, { licht: 'aan', fasen: [{ segs: [a], tijd: 10 }, { segs: [b, ...rest], tijd: 30 }] });
  vk.stap(0.1);
  const l = vk.stroken.lichten.get(knoop.id)!;
  check('fasen ingesteld', !!l && l.vast === true && l.tijden?.join() === '10,30');
  const f0 = l.fase;
  for (let i = 0; i < 160; i++) vk.stap(0.1);
  check('fase wisselt na 10 s + oranje', vk.stroken.lichten.get(knoop.id)!.fase !== f0);
  R.zetKnoop(knoop.id, { licht: 'auto', fasen: undefined }); vk.stap(0.1);
  check('fasen weg', !R.knoop.has(knoop.id));
}
// Snelheid.
R.zetLimiet(inSeg, 30); vk.stap(0.1);
check('maximumsnelheid 30', vk.stroken.stroken(inSeg, 'A').concat(vk.stroken.stroken(inSeg, 'B')).every(b => Math.abs(b.vmax - 30 / 3.6) < 0.01));
// Stopbord: draaien en kijken of er voertuigen stoppen.
for (const s of knoop.segs) R.zetEind(s, knoop.id, { bord: 'stop' });
vk.stap(0.1);
let door = 0, snelDoor = 0;
const gezien = new Set<number>();
for (let i = 0; i < 1500; i++) {
  vk.stap(0.1);
  for (const v of vk.voertuigen.values()) {
    const sp = vk.stroken.sporen.get(v.spoor);
    if (sp?.soort === 'verbinding' && sp.knoop === knoop.id && !gezien.has(v.id) && v.s < 3) { gezien.add(v.id); door++; if (v.v > 4.5) snelDoor++; }
  }
}
check('stopborden: iedereen stopt eerst', door >= 2 && snelDoor === 0, `${door} over het kruispunt, ${snelDoor} zonder te stoppen`);
check('stopborden: verkeer blijft rijden', vk.voertuigen.size > 50, `${vk.voertuigen.size} voertuigen, doorstroming ${Math.round(vk.doorstroming * 100)}%`);
// Verbod op vrachtverkeer in de hele stad: geen nieuwe vrachtwagens meer met een route.
for (const s of net.segmenten.values()) R.zetVerbod(s.id, ['vracht']);
vk.wis();
for (let i = 0; i < 600; i++) vk.stap(0.1);
const vracht = [...vk.voertuigen.values()].filter(v => v.soort === 'vrachtwagen').length;
check('vrachtverbod', vracht === 0, `${vk.voertuigen.size} voertuigen, ${vracht} vrachtwagens`);
// Opslaan.
const j = JSON.parse(JSON.stringify(net.naarJson()));
const w2 = new Wereld(1); w2.net.vanJson(j);
check('opslaan en laden', w2.net.regels.limiet(inSeg) === 30 && w2.net.regels.bord(inSeg, knoop.id) === 'stop' && w2.net.regels.verboden(inSeg)[0] === 'vracht');
// Wissen.
const n = vk.wis();
check('verkeer wissen', vk.voertuigen.size === [...vk.voertuigen.values()].filter(v => v.opAankomst).length, `${n} weg`);
if (fout) process.exit(1);
