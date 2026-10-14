// Webworker: genereert procedurele texturen buiten de hoofdthread.
import { maakTextuur } from '../core/tex';

self.onmessage = (e: MessageEvent<{ id: number; sleutel: string }>) => {
  const t = maakTextuur(e.data.sleutel);
  const lijst: ArrayBuffer[] = [t.albedo.buffer as ArrayBuffer];
  if (t.normaal) lijst.push(t.normaal.buffer as ArrayBuffer);
  if (t.orm) lijst.push(t.orm.buffer as ArrayBuffer);
  (self as unknown as Worker).postMessage({ id: e.data.id, t }, lijst);
};
