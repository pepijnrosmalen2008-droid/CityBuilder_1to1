// Een voorziening plaatsen via het gereedschap op een kale kaart met één weg.
import { Wereld } from '../../src/core/wereld';
import { Gereedschap } from '../../src/core/gereedschap';
const w = new Wereld(1);
w.geld = 1e8;
w.legWeg({ x: -400, z: 0 }, { x: -300, z: 0 }, { x: -200, z: 0 }, 'straat');
const g = new Gereedschap(w);
g.zetModus('dienst'); g.dienst = 'pompstation';
g.beweeg({ x: -300, y: 0, z: 40 });
const vb = g.voorbeeld(); console.log('voorbeeld', vb.soort === 'dienst' ? `${vb.tekst} geldig ${vb.geldig}` : vb.soort);
g.klik({ x: -300, y: 0, z: 40 }); console.log('melding', g.melding || '-', 'diensten', w.voorzieningen.diensten.size);
g.klik({ x: -300, y: 0, z: 40 }); console.log('nog een keer op dezelfde plek:', g.melding);
for (let i = 0; i < 200; i++) w.stap(0.25);
console.log('klaar', [...w.voorzieningen.diensten.values()][0].klaar, 'nieuws', w.nieuws.slice(0, 2).map((n: any) => n.tekst).join(' | '));
g.zetModus('sloop'); g.klik({ x: -300, y: 0, z: 40 }); console.log('na slopen', w.voorzieningen.diensten.size);
