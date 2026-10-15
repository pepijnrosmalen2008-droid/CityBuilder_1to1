import { Wereld } from '../../src/core/wereld';
import { Gereedschap } from '../../src/core/gereedschap';
const w = new Wereld(1);
w.geld = 1e9;
w.legWeg({ x: -400, z: 0 }, { x: -300, z: 0 }, { x: -200, z: 0 }, 'straat');
const g = new Gereedschap(w);
g.zetModus('gebied'); g.grondstof = 'landbouw';
g.klik({ x: -300, y: 0, z: 200 }); console.log('ver van de weg:', g.melding || 'geen melding');
g.melding = '';
g.beweeg({ x: -300, y: 0, z: 30 }); const vb = g.voorbeeld(); console.log('voorbeeld:', vb.soort === 'gebied' ? vb.tekst + ' | hoofd ' + !!vb.hoofd : vb.soort);
g.klik({ x: -300, y: 0, z: 30 });
for (const p of [{ x: -100, z: 20 }, { x: -100, z: 400 }, { x: -500, z: 400 }, { x: -500, z: 20 }]) g.klik({ x: p.x, y: 0, z: p.z });
g.rondGebiedAf();
console.log('melding:', g.melding || '-', '| gebieden', w.economie.gebieden.size);
for (const ge of w.economie.gebieden.values()) { const b = w.economie.bedrijven.get(ge.hoofd!); console.log('hoofd op', b?.p.x.toFixed(0), b?.p.z.toFixed(0), 'akkers', ge.velden.length); }
