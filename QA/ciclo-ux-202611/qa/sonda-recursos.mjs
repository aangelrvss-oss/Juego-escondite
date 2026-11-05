// QA · sonda: cuenta peticiones de una página de inicio (diagnóstico de ERR_INSUFFICIENT_RESOURCES).
import { launch, sleep } from './lib.mjs';
const base = process.argv[2] ?? 'http://127.0.0.1:8831';
const [w, h] = (process.argv[3] ?? '360x640').split('x').map(Number);
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const counts = new Map();
page.on('request', (r) => counts.set(r.url(), (counts.get(r.url()) ?? 0) + 1));
const fails = [];
page.on('requestfailed', (r) => fails.push(`${r.url()} ${r.failure()?.errorText}`));
await page.goto(base, { waitUntil: 'domcontentloaded' });
await sleep(4000);
console.log('peticiones', [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8));
console.log('fallos', fails.slice(0, 5), fails.length);
console.log('#f-name visible', await page.isVisible('#f-name'));
await browser.close();
