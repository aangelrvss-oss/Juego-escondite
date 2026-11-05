import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LIMITS, PRESENCE } from '../../engine/src/constants.ts';
import { GUIDE_IMAGES, GUIDE_RULES, GUIDE_VERSION, guideOverlay, guideStepFor, guideSteps } from '../www/js/guide.js';

// Guía visual (QA/ciclo-ux-202611/guia/INFORME_GUIA.md): pasos, imágenes reales y overlay accesible.

const www = fileURLToPath(new URL('../www/', import.meta.url));
const MODES = ['classic', 'infection', 'fox_hunt', null];
const BUDGET = 450 * 1024;

/** Ancho y alto de un WebP (VP8, VP8L o VP8X). */
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1];
  }
  if (kind === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  throw new Error(`WebP desconocido: ${kind}`);
}

test('versión de la guía', () => {
  assert.equal(GUIDE_VERSION, 1);
});

test('las cifras propias de la guía son las del motor', () => {
  assert.equal(GUIDE_RULES.maxPlayers, LIMITS.maxPlayers);
  assert.equal(GUIDE_RULES.awayAfterMs, PRESENCE.awayAfterMs);
  assert.equal(GUIDE_RULES.absenceTimeoutMs, PRESENCE.absenceTimeoutMs);
});

for (const mode of MODES) {
  test(`modo ${mode ?? 'general'}: 12 pasos completos y con imagen real`, () => {
    const steps = guideSteps(mode);
    assert.equal(steps.length, 12);
    const ids = new Set();
    for (const s of steps) {
      for (const k of ['id', 'title', 'text', 'img', 'alt']) assert.ok(typeof s[k] === 'string' && s[k].trim().length > 0, `${s.id}.${k} vacío`);
      ids.add(s.id);
      assert.match(s.img, /^guia\/[a-z0-9-]+\.webp$/);
      const file = join(www, s.img);
      assert.ok(existsSync(file), `falta ${s.img}`);
      assert.deepEqual(webpSize(readFileSync(file)), [s.width, s.height], `tamaño de ${s.img}`);
      // Texto corto: como mucho 3 frases (sin contar los paréntesis).
      const sentences = s.text.replace(/\([^)]*\)/g, '').split(/[.!?](?:\s|$)/).filter((x) => x.trim());
      assert.ok(sentences.length <= 3, `${mode}/${s.id}: ${sentences.length} frases`);
    }
    assert.equal(ids.size, 12, 'ids únicos');
  });
}

test('el texto se adapta al modo', () => {
  const text = (mode, id) => guideSteps(mode).find((s) => s.id === id).text;
  assert.match(text('infection', 'capture'), /se convierte en cazador/);
  assert.match(text('fox_hunt', 'runner'), /ves a los cazadores en directo/);
  assert.match(text('fox_hunt', 'clues'), /posición exacta del zorro/);
  assert.match(text('classic', 'capture'), /espectador/);
  assert.match(text('classic', 'intro'), /2–20/);
  assert.match(text('infection', 'intro'), /4–20/);
  assert.match(text('fox_hunt', 'intro'), /3–20/);
  assert.match(text('classic', 'connection'), /30 s.*5 min/);
});

test('guideStepFor da índices válidos y apunta al paso correcto', () => {
  const ids = { capture: 'capture', zone: 'zone', connection: 'connection', location: 'location', roles: 'roles' };
  for (const [topic, id] of Object.entries(ids)) {
    const i = guideStepFor(topic);
    assert.ok(Number.isInteger(i) && i >= 0 && i < 12, topic);
    for (const mode of MODES) assert.equal(guideSteps(mode)[i].id, id, `${topic} en ${mode}`);
  }
  assert.equal(guideStepFor('desconocido'), 0);
});

test('overlay: diálogo modal, indicador, cierre y navegación', () => {
  const html = guideOverlay({ step: 2, mode: 'classic', context: 'home' });
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
  assert.match(html, /aria-labelledby="guide-title"/);
  assert.match(html, /id="guide-title"/);
  assert.match(html, /Paso 3 de 12/);
  assert.match(html, /data-act="guide-close"[^>]*aria-label="Cerrar la guía"/);
  assert.match(html, /data-act="guide-prev"(?![^>]*disabled)/);
  assert.match(html, /data-act="guide-next"[^>]*>Siguiente</);
  assert.equal((html.match(/data-act="guide-goto"/g) ?? []).length, 12);
  assert.match(html, /data-step="2" aria-label="[^"]+" aria-current="step"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /width="\d+" height="\d+"/);
});

test('overlay: «Anterior» deshabilitado en el primer paso y la primera imagen sin lazy', () => {
  const html = guideOverlay({ step: 0, mode: null, context: 'home' });
  assert.match(html, /Paso 1 de 12/);
  assert.match(html, /data-act="guide-prev" disabled/);
  assert.doesNotMatch(html, /loading="lazy"/);
});

test('overlay: «Entendido» cierra en el último paso', () => {
  const html = guideOverlay({ step: 11, mode: 'fox_hunt', context: 'lobby' });
  assert.match(html, /Paso 12 de 12/);
  assert.match(html, /data-act="guide-close">Entendido</);
  assert.doesNotMatch(html, /data-act="guide-next"/);
});

test('overlay: pasos fuera de rango se ajustan y en partida avisa de que sigue', () => {
  assert.match(guideOverlay({ step: 99, mode: 'infection' }), /Paso 12 de 12/);
  assert.match(guideOverlay({ step: -3 }), /Paso 1 de 12/);
  assert.match(guideOverlay({ step: 'x' }), /Paso 1 de 12/);
  assert.match(guideOverlay({ step: 7, context: 'game' }), /La partida sigue en marcha/);
  assert.doesNotMatch(guideOverlay({ step: 7, context: 'home' }), /La partida sigue en marcha/);
});

test('overlay: escapa el texto', () => {
  const html = guideOverlay({ step: 0, mode: '"><script>alert(1)</script>', context: '"><b>' });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>/);
  // Todo el texto visible y los atributos de los pasos pasan por el escape.
  for (const mode of MODES) {
    for (let i = 0; i < 12; i++) {
      const out = guideOverlay({ step: i, mode });
      const s = guideSteps(mode)[i];
      const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      assert.ok(out.includes(esc(s.text)), `texto de ${s.id}`);
      assert.ok(out.includes(`alt="${esc(s.alt)}"`), `alt de ${s.id}`);
    }
  }
});

test('todas las imágenes declaradas existen y guia/ cabe en 450 KB', () => {
  const dir = join(www, 'guia');
  for (const name of Object.keys(GUIDE_IMAGES)) assert.ok(existsSync(join(dir, `${name}.webp`)), name);
  const total = readdirSync(dir).reduce((sum, f) => sum + statSync(join(dir, f)).size, 0);
  assert.ok(total <= BUDGET, `guia/ pesa ${(total / 1024).toFixed(1)} KB`);
});
