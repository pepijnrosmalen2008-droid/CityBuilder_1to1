import { Wereld } from '../../src/core/wereld';
import { bouwVoorbeeldstad } from '../../src/core/demo';
const w = new Wereld(1);
bouwVoorbeeldstad(w, 0);
for (const id of process.argv.slice(2).map(Number)) {
  const s = w.net.segmenten.get(id)!; const A = w.net.knopen.get(s.a)!, B = w.net.knopen.get(s.b)!;
  console.log(id, s.type, s.naam, 'A', A.p.x.toFixed(0), A.p.z.toFixed(0), 'deg', A.segs.length, 'B', B.p.x.toFixed(0), B.p.z.toFixed(0), 'deg', B.segs.length, 'L', s.lengte.toFixed(0), 'brug', s.pad.filter(p => p.brug).length);
  const st = (w as any).stroken.get(`${id}:1`), st2 = (w as any).stroken.get(`${id}:-1`);
  for (const x of [st, st2]) if (x) console.log('  strook', x.zijde, 'knippen', JSON.stringify(x.knippen.map((k: any) => ({ o: [k.o.x.toFixed(1), k.o.z.toFixed(1)], n: [k.n.x.toFixed(2), k.n.z.toFixed(2)], st: k.straat, h: k.hoek }))), 's', x.s0.toFixed(1), x.s1.toFixed(1));
}
