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

  // Zones.
  for (const k of [...w.kavels.values()]) {
    const c = kavelMidden(k);
    const seg = w.net.segmenten.get(k.seg)!;
    let zone: Zone;
    if (seg.type === 'laan') zone = Math.abs(c.x + 220) < 170 ? 'kantoor' : 'gemengd';
    else if (seg.type === 'tramstraat') zone = 'gemengd';
    else if (seg.type === 'straatBus') zone = 'wonenHoog';
    else if (c.z > 260) zone = c.x < -330 ? 'industrie' : 'wonenHoog';
    else if (seg.type === 'straat' && c.z > 40) zone = c.z < 140 ? 'gemengd' : 'wonenHoog';
    else zone = 'wonenLaag';
    w.zoneer(c, 0.1, zone);
  }
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
  // Zones zodat de percelen zichtbaar zijn.
  for (const k of [...w.kavels.values()]) w.zoneer(kavelMidden(k), 0.1, 'wonenLaag');
}
