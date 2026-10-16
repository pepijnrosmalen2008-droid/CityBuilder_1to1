// Wegbouw zoals CS: raster, parallel, eenrichting omkeren, slepend slopen.
import { Wereld } from '../../src/core/wereld';
import { Gereedschap } from '../../src/core/gereedschap';
const w = new Wereld(1);
w.geld = 1e9;
const g = new Gereedschap(w);
const v3 = (x: number, z: number) => ({ x, y: w.terrein.hoogte(x, z), z });
g.zetModus('weg'); g.wegtype = 'straat'; g.hulplijnen = false; g.stijl = 'raster';
g.klik(v3(100, 100)); g.klik(v3(400, 100)); g.beweeg(v3(400, 330));
const vb = g.voorbeeld();
console.log('raster voorbeeld', vb.soort === 'weg' ? vb.tekst + ' lijnen ' + (vb.meer?.length ?? 0) : vb.soort);
g.klik(v3(400, 330));
console.log('raster: segmenten', w.net.segmenten.size, 'knopen', w.net.knopen.size, 'melding', g.melding);
const kruis = [...w.net.knopen.values()].filter(k => k.segs.length === 4).length;
console.log('kruisingen met 4 armen', kruis);
// Parallel
const n0 = w.net.segmenten.size;
g.stijl = 'recht'; g.parallel = 74;
g.klik(v3(-400, -300)); g.klik(v3(-100, -300)); g.terug();
console.log('parallel: nieuwe segmenten', w.net.segmenten.size - n0);
// Eenrichting omkeren
g.parallel = 0; g.wegtype = 'eenrichting';
g.klik(v3(-400, 400)); g.klik(v3(-150, 400)); g.terug();
const s = [...w.net.segmenten.values()].find(x => x.type === 'eenrichting')!;
w.verkeer?.stroken?.bouw?.();
g.zetModus('opwaarderen');
console.log('omkeren', g.rechts(v3(-275, 400)), 'om', s.om);
// Slepend slopen over de raster-onderkant
g.zetModus('sloop');
const n1 = w.net.segmenten.size;
g.klik(v3(110, 100));
for (let x = 110; x <= 390; x += 10) { g.beweeg(v3(x, 100)); g.stap(0.016); }
g.los();
console.log('gesloopt door slepen', n1 - w.net.segmenten.size);
const ok = kruis > 0 && w.net.segmenten.size > 0 && s.om && n1 - w.net.segmenten.size >= 2;
if (!ok) { console.error('FOUT'); process.exit(1); }
console.log('ok');
