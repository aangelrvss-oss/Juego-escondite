// Genera la marca de la app a partir de la demo (única fuente de verdad): los trazados SVG del
// símbolo y del logotipo (demo/src/ui.js) y los tokens de color (:root de demo/src/styles.css).
import { readFileSync, writeFileSync } from 'node:fs';

export function extractBrand(uiSource, cssSource) {
  const pick = (name) => {
    const m = uiSource.match(new RegExp(`const ${name} = '([^']+)';`));
    if (!m) throw new Error(`No se encuentra ${name} en demo/src/ui.js`);
    return m[1];
  };
  const viewBox = uiSource.match(/class="wordmark" viewBox="([^"]+)"/);
  const root = cssSource.match(/:root \{([\s\S]*?)\n\}/);
  if (!viewBox || !root) throw new Error('No se encuentran el viewBox del logotipo o los tokens :root');
  return {
    symbolPaths: pick('SYMBOL_PATHS'),
    wordmarkPaths: pick('WORDMARK_PATHS'),
    wordmarkViewBox: viewBox[1],
    tokens: root[1].trim(),
  };
}

export function renderBrand(brand) {
  const js = `// GENERADO por scripts/sync-brand.mjs desde demo/src/ui.js. No editar a mano.
export const SYMBOL_PATHS = ${JSON.stringify(brand.symbolPaths)};
export const WORDMARK_PATHS = ${JSON.stringify(brand.wordmarkPaths)};
export const WORDMARK_VIEWBOX = ${JSON.stringify(brand.wordmarkViewBox)};
`;
  const css = `/* GENERADO por scripts/sync-brand.mjs desde demo/src/styles.css. No editar a mano. */
:root {
  ${brand.tokens}
}
`;
  return { js, css };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ui = readFileSync(new URL('../../demo/src/ui.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../demo/src/styles.css', import.meta.url), 'utf8');
  const out = renderBrand(extractBrand(ui, css));
  writeFileSync(new URL('../www/js/brand.generated.js', import.meta.url), out.js);
  writeFileSync(new URL('../www/css/tokens.generated.css', import.meta.url), out.css);
  console.log('Marca generada: www/js/brand.generated.js y www/css/tokens.generated.css');
}
