// Construye la demo visual en UN solo HTML autocontenido (sin dependencias, sin red).
// Uso: node demo/build.mjs  →  demo/dist/rastro-demo.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';

const root = new URL('./', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const sim = read('src/sim.js');
const ui = read('src/ui.js');
const template = read('index.html');
// Portada local (sin red): se incrusta en el CSS como data URI donde aparece «@COVER@».
const cover = readFileSync(new URL('src/assets/cover.webp', root));
const cssSource = read('src/styles.css');
if (!cssSource.includes('@COVER@')) throw new Error('styles.css debe referenciar la portada con @COVER@');
const css = cssSource.replace('@COVER@', () => `data:image/webp;base64,${cover.toString('base64')}`);

const exported = [...sim.matchAll(/^export (?:const|function|let) (\w+)/gm)].map((m) => m[1]);
const simBody = sim.replace(/^export /gm, '');
const importLine = "import * as S from './sim.js';\n";
if (!ui.includes(importLine)) throw new Error('ui.js debe importar sim.js como S');
const uiBody = ui.replace(importLine, '').replace(/^export /gm, '');
for (const [name, code] of [['sim.js', simBody], ['ui.js', uiBody]]) {
  if (/^\s*(import|export)\b/m.test(code)) throw new Error(`${name}: quedan import/export sin resolver`);
}

const build = createHash('sha256').update(sim).update(ui).update(cssSource).update(cover).update(template).digest('hex').slice(0, 8);
const js = `(() => {
'use strict';
const __BUILD__ = 'build ${build}';
const S = (() => {
${simBody}
return { ${exported.join(', ')} };
})();
${uiBody}
boot();
})();`;

new Script(js, { filename: 'rastro-demo.js' }); // comprobación de sintaxis
if (/<\/script/i.test(js) || /<\/style/i.test(css)) throw new Error('El código no puede contener cierres de etiqueta');

const html = template.replace('/*@CSS@*/', () => css).replace('/*@JS@*/', () => js);
mkdirSync(new URL('dist/', root), { recursive: true });
const out = new URL('dist/rastro-demo.html', root);
writeFileSync(out, html);
console.log(`demo/dist/rastro-demo.html · ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB · build ${build}`);
