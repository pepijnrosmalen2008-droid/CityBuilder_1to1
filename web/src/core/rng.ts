// Deterministisch: dezelfde seed geeft overal (ook in een andere engine) dezelfde stad.
export function hash32(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
export const hash01 = (a: number, b = 0, c = 0) => hash32(a, b, c) / 4294967296;

/** Mulberry32. */
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 1; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, bIncl: number) { return a + Math.floor(this.next() * (bIncl - a + 1)); }
  kies<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  kans(p: number) { return this.next() < p; }
  get staat() { return this.s; }
  set staat(v: number) { this.s = v >>> 0; }
}
