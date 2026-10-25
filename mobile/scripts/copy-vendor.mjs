// Copia el runtime JS de Capacitor (ESM, sin dependencias, licencia MIT) a www/vendor.
// La interfaz no usa empaquetador: el WebView carga módulos ES servidos localmente por la app.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';

const src = new URL('../node_modules/@capacitor/core/dist/index.js', import.meta.url);
const dest = new URL('../www/vendor/capacitor-core.js', import.meta.url);
const code = readFileSync(src, 'utf8');
if (/^\s*import\s/m.test(code)) throw new Error('@capacitor/core/dist/index.js tiene imports: no se puede copiar tal cual');
mkdirSync(new URL('../www/vendor/', import.meta.url), { recursive: true });
copyFileSync(src, dest);
console.log('www/vendor/capacitor-core.js copiado desde @capacitor/core');
