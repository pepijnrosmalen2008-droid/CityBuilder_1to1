// Draait een TypeScript-testscript met Node (gebundeld met esbuild, dat Vite al meebrengt).
import { build } from 'esbuild';
const [bestand, ...rest] = process.argv.slice(2);
const uit = new URL('../node_modules/.cache/test.mjs', import.meta.url).pathname;
await build({ entryPoints: [bestand], bundle: true, platform: 'node', format: 'esm', outfile: uit, logLevel: 'error' });
process.argv = [process.argv[0], uit, ...rest];
await import(uit + '?' + Date.now());
