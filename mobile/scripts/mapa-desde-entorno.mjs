// Despliegue (Render u otro alojamiento): crea www/mapa.config.json a partir de variables de entorno, en
// vez de tener la clave en el repositorio. Ver docs/DEPLOYMENT.md y MAPA.md.
//   MAPTILER_KEY    clave PÚBLICA de MapTiler (la usa el navegador; restringida por origen en MapTiler).
//   MAPTILER_STYLE  (opcional) estilo de MapTiler; por defecto, el de la app (dataviz-v4-dark).
// Sin MAPTILER_KEY se escribe {"proveedor": "ninguno"}: la partida funciona con el radar de reserva.
// Nunca escribe la clave en la consola ni en el registro del despliegue.
import { writeFileSync } from 'node:fs';

const key = (process.env.MAPTILER_KEY ?? '').trim();
const style = (process.env.MAPTILER_STYLE ?? '').trim();
const file = new URL('../www/mapa.config.json', import.meta.url);

if (!key) {
  writeFileSync(file, `${JSON.stringify({ proveedor: 'ninguno' }, null, 2)}\n`);
  console.log('mapa.config.json: sin MAPTILER_KEY, mapa desactivado (radar de reserva).');
} else if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) {
  // Mismo formato que acepta la interfaz (map-view.js): mejor fallar el despliegue que publicar un mapa roto.
  console.error('mapa.config.json: MAPTILER_KEY no tiene el formato de una clave de MapTiler.');
  process.exit(1);
} else {
  if (style && !/^[a-z0-9-]{1,64}$/.test(style)) {
    console.error('mapa.config.json: MAPTILER_STYLE no es un nombre de estilo válido.');
    process.exit(1);
  }
  writeFileSync(file, `${JSON.stringify({ proveedor: 'maptiler', clave: key, ...(style ? { estilo: style } : {}) }, null, 2)}\n`);
  console.log(`mapa.config.json: MapTiler configurado (clave de ${key.length} caracteres${style ? `, estilo ${style}` : ''}).`);
}
