// Opslaan in de browser (IndexedDB), gecomprimeerd met gzip als de browser dat kan.
// De inhoud is de engine-onafhankelijke JSON uit Wereld.naarJson().

const DB = 'stadbouwer', STORE = 'steden', SLEUTEL = 'laatste';

export interface OpslagInfo { naam: string; inwoners: number; datum: string; opgeslagen: number }

function open(): Promise<IDBDatabase> {
  return new Promise((ok, fout) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fout(r.error);
  });
}

async function zet(waarde: unknown) {
  const db = await open();
  await new Promise<void>((ok, fout) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(waarde, SLEUTEL); t.oncomplete = () => ok(); t.onerror = () => fout(t.error); });
  db.close();
}

async function haal<T>(): Promise<T | undefined> {
  const db = await open();
  const r = await new Promise<T | undefined>((ok, fout) => { const t = db.transaction(STORE, 'readonly'); const q = t.objectStore(STORE).get(SLEUTEL); q.onsuccess = () => ok(q.result as T); q.onerror = () => fout(q.error); });
  db.close();
  return r;
}

const rond = (_k: string, v: unknown) => typeof v === 'number' ? Math.round(v * 100) / 100 : v;

export async function bewaar(data: unknown, info: Omit<OpslagInfo, 'opgeslagen'>): Promise<void> {
  const tekst = JSON.stringify(data, rond);
  let inhoud: Blob | string = tekst;
  if ('CompressionStream' in window) inhoud = await new Response(new Blob([tekst]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  await zet({ info: { ...info, opgeslagen: Date.now() }, inhoud });
}

export async function laadInfo(): Promise<OpslagInfo | null> {
  try { const x = await haal<{ info: OpslagInfo }>(); return x?.info ?? null; } catch { return null; }
}

export async function laad<T>(): Promise<T | null> {
  const x = await haal<{ inhoud: Blob | string }>();
  if (!x) return null;
  const tekst = typeof x.inhoud === 'string' ? x.inhoud : await new Response(x.inhoud.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(tekst) as T;
}

export async function wis() { try { await zet(undefined); } catch { /* niets */ } }
