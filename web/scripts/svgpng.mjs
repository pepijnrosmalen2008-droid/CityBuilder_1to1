// SVG naar PNG via headless Chromium: node scripts/svgpng.mjs in.svg uit.png
import { chromium } from 'playwright-core';
import { readFileSync } from 'fs';
const [inp, uit] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROMIUM });
const p = await b.newPage({ viewport: { width: 800, height: 800 } });
await p.setContent(`<body style="margin:0">${readFileSync(inp, 'utf8')}</body>`);
await p.screenshot({ path: uit });
await b.close();
