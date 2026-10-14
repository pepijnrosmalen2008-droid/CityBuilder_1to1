// Bewaakt de scheiding tussen de lagen: src/core mag niets weten van three.js, de browser
// (document/window) of de render-/ui-laag. Zo blijft de kern over te zetten naar een andere
// engine (Unity, Godot, Bevy, ...).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const VERBODEN = [/from ['"]three/, /from ['"]\.\.\/(render|ui)\//, /from ['"]\.\.\/\.\.\/(render|ui)\//, /\bdocument\./, /\bwindow\./, /\bHTMLElement\b/];
let fout = 0;
function loop(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { loop(p); continue; }
    if (!p.endsWith('.ts')) continue;
    const t = readFileSync(p, 'utf8');
    for (const r of VERBODEN) if (r.test(t)) { console.error(`core mag dit niet gebruiken: ${r} in ${p}`); fout++; }
  }
}
loop(new URL('../src/core', import.meta.url).pathname);
if (fout) process.exit(1);
console.log('core is engine-onafhankelijk');
