// Recorta capturas REALES de la interfaz de THE OUTRUN y las convierte a WebP (720 px de ancho) con
// Chrome (canvas.toDataURL('image/webp')). Sin dependencias nuevas: Playwright de mobile/node_modules.
// Uso: node QA/ciclo-ux-202611/guia/hacer-imagenes.mjs [calidad=0.78]
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../..');
const require = createRequire(join(root, 'mobile/package.json'));
const { chromium } = require('playwright');

const QUALITY = Number(process.argv[2] ?? 0.78);
const OUT_W = 720;
const outDir = join(root, 'mobile/www/guia');
mkdirSync(outDir, { recursive: true });

// Origen de cada imagen: archivo de QA y recorte en píxeles del original.
const Z = 'QA/ciclo-20261101-zona-dinamica/capturas';
export const CROPS = [
  { out: 'inicio', src: 'QA/produccion-20261104/capturas-pwa/inicio-produccion.png', y: 0, h: 960 },
  { out: 'sala-codigo', src: `${Z}/e2e-infeccion/01-sala-3-Ana.png`, y: 120, h: 760 },
  { out: 'preparacion', src: `${Z}/e2e-infeccion/01-sala-3-Ana.png`, y: 2085, h: 815 },
  { out: 'cuenta-atras', src: `${Z}/e2e-game/03-cuenta-Dani.png`, y: 225, h: 720 },
  { out: 'rol-cazador', src: `${Z}/e2e-game/04-rol-Ana.png`, y: 650, h: 530 },
  { out: 'rol-fugitivo', src: `${Z}/e2e-game/04-rol-Caro.png`, y: 650, h: 530 },
  { out: 'pista', src: `${Z}/e2e-playtest-ui/05-pista-Ana.png`, y: 140, h: 1060 },
  { out: 'captura', src: `${Z}/e2e-game/05-reclamacion-Caro.png`, y: 1320, h: 480 },
  { out: 'zona', src: `${Z}/zona/z2-fase1-mitad.png`, y: 440, h: 860 },
  { out: 'final', src: `${Z}/e2e-playtest-ui/07-final-cazadores-Ana.png`, y: 160, h: 980 },
  { out: 'conexion', src: `${Z}/e2e-map/4-sin-conexion.png`, y: 130, h: 880 },
  { out: 'ubicacion', src: `${Z}/e2e-map/4-sin-conexion.png`, y: 1400, h: 390 },
  // Variantes por modo.
  { out: 'zorro-cazador', src: `${Z}/e2e-zorro/02-rol-Beto.png`, y: 400, h: 680 },
  { out: 'zorro-fugitivo', src: `${Z}/e2e-zorro/03-zorro-ve-Zoe.png`, y: 480, h: 980 },
  { out: 'zorro-pista', src: `${Z}/e2e-zorro/04-pista-Ana.png`, y: 140, h: 1070 },
  { out: 'infeccion-convertido', src: `${Z}/e2e-infeccion/02-infectado-Beto.png`, y: 440, h: 580 },
];

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setContent('<!doctype html><canvas id="c"></canvas>');
const rows = [];
for (const c of CROPS) {
  const b64 = readFileSync(join(root, c.src)).toString('base64');
  const res = await page.evaluate(async ({ b64, c, OUT_W, QUALITY }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const sw = img.naturalWidth;
    const sh = Math.min(c.h, img.naturalHeight - c.y);
    const outH = Math.round((sh * OUT_W) / sw);
    const cv = document.getElementById('c');
    cv.width = OUT_W;
    cv.height = outH;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, c.y, sw, sh, 0, 0, OUT_W, outH);
    return { url: cv.toDataURL('image/webp', QUALITY), w: OUT_W, h: outH, srcW: sw, srcH: img.naturalHeight };
  }, { b64, c, OUT_W, QUALITY });
  const file = join(outDir, `${c.out}.webp`);
  writeFileSync(file, Buffer.from(res.url.split(',')[1], 'base64'));
  rows.push({ ...c, cropH: c.h, w: res.w, outH: res.h, srcSize: `${res.srcW}x${res.srcH}`, bytes: statSync(file).size });
}
await browser.close();
let total = 0;
for (const r of rows) {
  total += r.bytes;
  console.log(`${r.out}.webp\t${r.w}x${r.outH}\t${(r.bytes / 1024).toFixed(1)} KB\t<- ${r.src} (${r.srcSize}) y=${r.y} h=${r.cropH}`);
}
console.log(`TOTAL ${(total / 1024).toFixed(1)} KB (calidad ${QUALITY})`);
writeFileSync(join(here, 'imagenes.json'), JSON.stringify({ quality: QUALITY, total, rows }, null, 2));
