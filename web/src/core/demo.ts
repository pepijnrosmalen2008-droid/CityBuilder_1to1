import { Wereld, kavelMidden } from './wereld';
import { WegTypeId } from './wegen/typen';
import { Zone } from './zones';
import { V2, lerp2 } from './math';

/** Een voorbeeldstad om mee te beginnen (en om screenshots van te maken). */
export function bouwVoorbeeldstad(w: Wereld, groeiSeconden = 1800) {
  w.geld = 1e9;
  const weg = (a: V2, b: V2, type: WegTypeId, c?: V2) => w.legWeg(a, c ?? lerp2(a, b, 0.5), b, type);
  // Hoofdas: stadslaan van west naar oost, met een brug over de rivier.
  weg({ x: -700, z: 40 }, { x: -200, z: 40 }, 'laan');
  weg({ x: -200, z: 40 }, { x: 180, z: 40 }, 'laan');
  weg({ x: 180, z: 40 }, { x: 560, z: 60 }, 'laan', { x: 380, z: 30 });
  // Rondweg (gebiedsontsluitingsweg) in het noorden, met een bocht.
  weg({ x: -700, z: 40 }, { x: -520, z: -380 }, 'gow', { x: -720, z: -300 });
  weg({ x: -520, z: -380 }, { x: 120, z: -400 }, 'gow', { x: -200, z: -440 });
  // Raster van straten ten noorden van de laan.
  for (let x = -560; x <= 120; x += 112) weg({ x, z: 40 }, { x, z: -360 }, x % 224 === 0 ? 'straat' : 'woonstraat');
  for (let z = -60; z >= -300; z -= 96) weg({ x: -580, z }, { x: 140, z }, z === -156 ? 'straatBus' : 'woonstraat');
  // Ten zuiden: straten richting de kust.
  for (let x = -560; x <= 120; x += 112) weg({ x, z: 40 }, { x, z: 360 }, 'straat');
  for (let z = 140; z <= 340; z += 100) weg({ x: -580, z }, { x: 140, z }, z === 240 ? 'tramstraat' : 'woonstraat');
  // Een gebogen woonstraat.
  weg({ x: -620, z: 140 }, { x: -620, z: 340 }, 'woonstraat', { x: -700, z: 240 });
  weg({ x: -620, z: 140 }, { x: -580, z: 140 }, 'woonstraat');
  weg({ x: -620, z: 340 }, { x: -580, z: 340 }, 'woonstraat');

  // Zones.
  for (const k of [...w.kavels.values()]) {
    const c = kavelMidden(k);
    const seg = w.net.segmenten.get(k.seg)!;
    let zone: Zone;
    if (seg.type === 'gow') continue;
    if (c.z < -250) zone = c.x > -200 ? 'industrie' : 'kantoor';
    else if (seg.type === 'laan') zone = Math.abs(c.x + 220) < 260 ? 'kantoor' : 'gemengd';
    else if (seg.type === 'tramstraat') zone = 'gemengd';
    else if (seg.type === 'straatBus') zone = 'wonenHoog';
    else if (c.z > 260) zone = c.x < -330 ? 'industrie' : 'wonenHoog';
    else if (seg.type === 'straat' && c.z > 40) zone = c.z < 140 ? 'gemengd' : 'wonenHoog';
    else zone = 'wonenLaag';
    w.zoneer(c, 0.1, zone);
  }
  // Buitengebied: ontsluitingswegen naar landbouw, bos, olie en een zandwinning.
  weg({ x: -700, z: 40 }, { x: -960, z: 70 }, 'gow');
  weg({ x: 560, z: 60 }, { x: 640, z: 330 }, 'gow', { x: 640, z: 150 });
  weg({ x: 120, z: -400 }, { x: 440, z: -470 }, 'gow');
  weg({ x: 560, z: 60 }, { x: 880, z: -210 }, 'gow', { x: 760, z: 40 });
  const e = w.economie;
  const gebied = (soort: Parameters<typeof e.maakGebied>[0], pts: [number, number][]) => { const f = e.maakGebied(soort, pts.map(([x, z]) => ({ x, z }))); if (f) console.warn('demo gebied', soort, f); };
  gebied('olie', [[-760, 80], [-940, 95], [-950, 260], [-770, 250]]);
  gebied('landbouw', [[400, 110], [620, 120], [630, 330], [420, 320]]);
  gebied('landbouw', [[660, 120], [880, 100], [900, 330], [665, 320]]);
  gebied('bosbouw', [[200, -430], [440, -490], [460, -700], [220, -680]]);
  gebied('delfstoffen', [[840, -230], [940, -250], [960, -420], [850, -400]]);

  // Nutsvoorzieningen langs de buitenwegen (windturbines in een rij, water, riool, afval).
  const vz = w.voorzieningen;
  const zet = (soort: Parameters<typeof vz.bouw>[0], segTypes: string[], aantal: number, tussen = 0) => {
    let n = 0;
    for (const seg of [...w.net.segmenten.values()].filter(x => segTypes.includes(x.type))) {
      for (let i = 2; i < seg.pad.length - 2 && n < aantal; i += 2) {
        for (const k of [1, -1]) {
          const q = seg.pad[i], p = { x: q.x - q.dz * k * 70, z: q.z + q.dx * k * 70 };
          if (p.x > -640 && p.x < 200 && p.z > -390 && p.z < 390) continue; // niet in de stad
          const r = vz.plek(soort, p);
          if (!r || r.fout) continue;
          if (tussen && [...vz.diensten.values()].some(d => d.soort === soort && Math.hypot(d.p.x - r.dienst.p.x, d.p.z - r.dienst.p.z) < tussen)) continue;
          if (!vz.bouw(soort, p)) { n++; break; }
        }
      }
      if (n >= aantal) break;
    }
  };
  zet('windmolen', ['gow', 'laan'], 6, 130);
  zet('gascentrale', ['gow'], 1);
  zet('pompstation', ['gow'], 1);
  zet('rwzi', ['gow'], 1);
  zet('stortplaats', ['gow'], 1);
  for (const d of vz.diensten.values()) { d.voortgang = 1; d.klaar = true; }

  // Groeien: de simulatie een tijd laten lopen.
  w.snelheid = 4;
  for (let t = 0; t < groeiSeconden; t += 1) w.stap(0.25);
  w.snelheid = 1;
  w.geld = 2_500_000;
}

/** Testscène met allerlei kruisingen en bochten (voor controle van de wegmeshes). */
export const TEST_PLEKKEN: Record<string, [number, number]> = {
  haaks: [-300, -200], t: [-100, -200], y: [100, -200], vijf: [-300, 0], schuin: [-100, 0],
  bochtIn: [100, 0], breedte: [-300, 200], knik: [-100, 200], s: [100, 200],
  viaduct: [-300, 420], tunnel: [-60, 420], afgerond: [180, 420],
};
export function bouwTestKruisingen(w: Wereld) {
  w.geld = 1e9;
  const weg = (a: V2, b: V2, type: WegTypeId, c?: V2) => { const r = w.legWeg(a, c ?? lerp2(a, b, 0.5), b, type); if (!r.ok) console.warn('test', r.fout, a, b); };
  const P = TEST_PLEKKEN;
  const o = (k: string, dx: number, dz: number): V2 => ({ x: P[k][0] + dx, z: P[k][1] + dz });
  // Haaks: straat x straat.
  weg(o('haaks', -60, 0), o('haaks', 60, 0), 'straat'); weg(o('haaks', 0, -60), o('haaks', 0, 60), 'straat');
  // T: laan met een zijstraat.
  weg(o('t', -70, 0), o('t', 70, 0), 'laan'); weg(o('t', 0, 0), o('t', 0, 60), 'straat');
  // Y: scherpe hoek (30°).
  weg(o('y', 0, 60), o('y', 0, 0), 'straat');
  weg(o('y', 0, 0), o('y', -30, -55), 'straat'); weg(o('y', 0, 0), o('y', 30, -55), 'woonstraat');
  // Vijfsprong.
  for (let i = 0; i < 5; i++) { const h = i / 5 * Math.PI * 2 + 0.3; weg(o('vijf', 0, 0), o('vijf', Math.cos(h) * 60, Math.sin(h) * 60), i % 2 ? 'straat' : 'woonstraat'); }
  // Schuin: ontsluitingsweg kruist een straat onder 45°.
  weg(o('schuin', -50, -50), o('schuin', 50, 50), 'gow'); weg(o('schuin', -60, 0), o('schuin', 60, 0), 'straat');
  // Bocht die op een kruising uitkomt.
  weg(o('bochtIn', -60, 0), o('bochtIn', 60, 0), 'straat'); weg(o('bochtIn', 0, 0), o('bochtIn', 50, 55), 'woonstraat', o('bochtIn', 0, 45));
  // Breedteovergang: laan gaat over in een straat.
  weg(o('breedte', -70, 0), o('breedte', 0, 0), 'laan'); weg(o('breedte', 0, 0), o('breedte', 70, 0), 'straat');
  // Knik van 60° in een straat.
  weg(o('knik', -60, 20), o('knik', 0, 20), 'straat'); weg(o('knik', 0, 20), o('knik', 30, -32), 'straat');
  // S-bocht.
  weg(o('s', -70, 30), o('s', 0, 0), 'straat', o('s', -35, -30)); weg(o('s', 0, 0), o('s', 70, -30), 'straat', o('s', 35, 30));
  // Viaduct: een verhoogde straat (8 m) over een straat op maaiveld, zonder kruispunt.
  const hoog = (a: V2, b: V2, type: WegTypeId, niveau: number, af = false) => { const r = w.legWeg(a, lerp2(a, b, 0.5), b, type, niveau, af); if (!r.ok) console.warn('test', r.fout, a, b); };
  weg(o('viaduct', -80, 0), o('viaduct', 80, 0), 'straat');
  hoog(o('viaduct', 0, -45), o('viaduct', 0, 45), 'straat', 8);
  hoog(o('viaduct', 0, -150), o('viaduct', 0, -45), 'straat', 0);
  hoog(o('viaduct', 0, 45), o('viaduct', 0, 150), 'straat', 0);
  // Tunnel: 8 m diep onder een straat door.
  weg(o('tunnel', 0, -70), o('tunnel', 0, 70), 'straat');
  hoog(o('tunnel', -40, 0), o('tunnel', 40, 0), 'laan', -8);
  hoog(o('tunnel', -160, 0), o('tunnel', -40, 0), 'laan', 0);
  hoog(o('tunnel', 40, 0), o('tunnel', 160, 0), 'laan', 0);
  // Automatisch afgeronde knik (rechte stukken, 90° en 45°).
  hoog(o('afgerond', -60, 40), o('afgerond', 0, 40), 'straat', 0);
  hoog(o('afgerond', 0, 40), o('afgerond', 0, -20), 'straat', 0, true);
  hoog(o('afgerond', 0, -20), o('afgerond', 50, -70), 'straat', 0, true);
  // Zones zodat de percelen zichtbaar zijn.
  for (const k of [...w.kavels.values()]) w.zoneer(kavelMidden(k), 0.1, 'wonenLaag');
}

/**
 * Nieuwe kaart: een snelweg vanaf de westrand naar binnen (de buitenaansluiting, zoals in Cities:
 * Skylines). Daarlangs komen de eerste auto's binnen en kan stroom en water worden ingekocht.
 */
export function legStartweg(w: Wereld) {
  const g = w.terrein.grootte / 2;
  const geld = w.geld;
  for (const z of [0, 120, -120, 240, -240, 360, -360]) {
    const a = { x: -g + 22, z }, b = { x: -g + 320, z };
    let land = true;
    for (let t = 0; t <= 1; t += 0.05) if (w.terrein.hoogte(a.x + (b.x - a.x) * t, z) < 1.5) { land = false; break; }
    if (!land) continue;
    const r = w.legWeg(a, lerp2(a, b, 0.5), b, 'snelweg');
    if (r.ok) break;
  }
  w.geld = geld;
}
