// Copia a www/vendor las bibliotecas de terceros que usa la interfaz, que no tiene empaquetador: el
// navegador y el WebView cargan módulos ES servidos tal cual.
//   - Runtime JS de Capacitor (ESM, sin dependencias, licencia MIT).
//   - MapLibre GL JS (ESM autónomo + su worker + CSS, licencia BSD-3-Clause): el mapa de la partida.
//     Su licencia exige conservar el aviso de copyright: se copia LICENSE.txt junto a la biblioteca.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const vendor = new URL('../www/vendor/', import.meta.url);
mkdirSync(vendor, { recursive: true });

const src = new URL('../node_modules/@capacitor/core/dist/index.js', import.meta.url);
const code = readFileSync(src, 'utf8');
if (/^\s*import\s/m.test(code)) throw new Error('@capacitor/core/dist/index.js tiene imports: no se puede copiar tal cual');
copyFileSync(src, new URL('capacitor-core.js', vendor));
console.log('www/vendor/capacitor-core.js copiado desde @capacitor/core');

const maplibre = new URL('../node_modules/maplibre-gl/', import.meta.url);
const maplibreDest = new URL('maplibre-gl/', vendor);
mkdirSync(maplibreDest, { recursive: true });
const main = readFileSync(new URL('dist/maplibre-gl.mjs', maplibre), 'utf8');
// El módulo se sirve sin empaquetador: no puede importar nada por nombre de paquete.
if (/^\s*import\s[^(]/m.test(main)) throw new Error('maplibre-gl.mjs tiene imports: no se puede copiar tal cual');
// Con extensión .js: el servidor del juego y algunos WebViews no sirven .mjs como JavaScript, y un
// módulo con otro tipo MIME no se ejecuta. map-view.js le indica a MapLibre dónde está su worker.
const files = { 'dist/maplibre-gl.mjs': 'maplibre-gl.js', 'dist/maplibre-gl-worker.mjs': 'maplibre-gl-worker.js', 'dist/maplibre-gl.css': 'maplibre-gl.css', 'LICENSE.txt': 'LICENSE.txt' };
for (const [from, to] of Object.entries(files)) copyFileSync(new URL(from, maplibre), new URL(to, maplibreDest));
const { version } = JSON.parse(readFileSync(new URL('package.json', maplibre), 'utf8'));
console.log(`www/vendor/maplibre-gl/ copiado desde maplibre-gl ${version}`);

// Configuración del mapa: si no existe, se crea una SIN clave ({"proveedor": "ninguno"}) para que la
// página no pida un archivo inexistente (un 404 en la consola de cada partida). Nunca se sobrescribe:
// si ya tiene la clave, se queda como está. Fuera de Git (.gitignore). Ver MAPA.md.
const mapConfig = new URL('../www/mapa.config.json', import.meta.url);
if (!existsSync(mapConfig)) {
  writeFileSync(mapConfig, `${JSON.stringify({ proveedor: 'ninguno' }, null, 2)}\n`);
  console.log('www/mapa.config.json creado sin clave (mapa desactivado hasta configurarlo: MAPA.md)');
}
