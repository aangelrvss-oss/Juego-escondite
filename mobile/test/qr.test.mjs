import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dataCodewords, encodeQr, formatBits, qrSvg, rsRemainder, versionBits, versionFor } from '../www/js/qr.js';

// Codificador QR del enlace de invitación (mobile/www/js/qr.js).
//
// Independencia de las referencias:
// - Los vectores de Reed-Solomon, de formato y de versión son valores publicados (norma ISO/IEC 18004,
//   ejemplo del anexo I, y el ejemplo clásico «HELLO WORLD» 1-M), escritos aquí como constantes.
// - Los codewords de datos de «Hi» están calculados a mano a partir de la norma (ver comentario).
// - El lector de ida y vuelta de este archivo NO importa nada del codificador salvo para generar el QR:
//   tiene su propio mapa de módulos fijos, sus propias máscaras (notación de la norma: i = fila,
//   j = columna), su propio recorrido en zigzag y valida el formato contra la tabla publicada.
// LÍMITE: no es un lector independiente de terceros ni una cámara. En este equipo no hay ninguno
// (Chrome y Edge de Windows no tienen BarcodeDetector). AC-A6 sigue pendiente en un móvil.

// ------------------------------------------------------------------ vectores publicados

test('Reed-Solomon: ejemplo «HELLO WORLD» 1-M (10 codewords de corrección)', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(rsRemainder(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('Reed-Solomon: ejemplo del anexo I de la norma («01234567», 1-M)', () => {
  const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  assert.deepEqual(rsRemainder(data, 10), [0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
});

// Tabla publicada de información de formato, nivel M (máscaras 0 a 7).
const FORMAT_M = [
  '101010000010010', '101000100100101', '101111001111100', '101101101001011',
  '100010111111001', '100000011001110', '100111110010111', '100101010100000',
];

test('bits de formato del nivel M para las 8 máscaras (tabla publicada)', () => {
  FORMAT_M.forEach((bits, mask) => assert.equal(formatBits(mask).toString(2).padStart(15, '0'), bits, `máscara ${mask}`));
});

test('bits de versión 7 a 10 (tabla publicada)', () => {
  const table = { 7: '000111110010010100', 8: '001000010110111100', 9: '001001101010011001', 10: '001010010011010011' };
  for (const [v, bits] of Object.entries(table)) assert.equal(versionBits(Number(v)).toString(2).padStart(18, '0'), bits, `versión ${v}`);
});

test('codewords de datos de «Hi» en 1-M, calculados a mano según la norma', () => {
  // 0100 (modo byte) · 00000010 (2 bytes) · 01001000 ('H') · 01101001 ('i') · 0000 (terminador)
  // = 01000000 00100100 10000110 10010000 → 0x40 0x24 0x86 0x90, y relleno 0xEC 0x11 hasta 16.
  const expected = [0x40, 0x24, 0x86, 0x90, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
  assert.deepEqual(dataCodewords([0x48, 0x69], 1), expected);
});

test('versión mínima por longitud en modo byte (capacidades publicadas del nivel M)', () => {
  // Capacidad en bytes, nivel M: v1 14, v2 26, v3 42, v4 62, v5 84, v6 106, v7 122, v8 152, v9 180, v10 213.
  const cap = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
  cap.forEach((n, i) => {
    assert.equal(versionFor(n), i + 1, `${n} bytes`);
    if (i < cap.length - 1) assert.equal(versionFor(n + 1), i + 2, `${n + 1} bytes`);
  });
  assert.equal(versionFor(214), null);
  assert.throws(() => encodeQr('x'.repeat(214)), /qr_too_long/);
});

// ------------------------------------------------------------------ lector independiente

// Centros de los patrones de alineación (tabla de la norma) y bloques del nivel M:
// [codewords de corrección por bloque, [[número de bloques, codewords de datos], …]].
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
const BLOCKS = {
  1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]],
  6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]],
};
// Máscaras con la notación de la norma: i = fila, j = columna.
const MASK = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0,
];

/** Módulos reservados (no son datos), según la norma. reserved[fila][columna]. */
function reservedMap(version) {
  const n = version * 4 + 17;
  const r = Array.from({ length: n }, () => new Array(n).fill(false));
  const box = (r0, c0, h, w) => {
    for (let i = r0; i < r0 + h; i++) for (let j = c0; j < c0 + w; j++) if (i >= 0 && j >= 0 && i < n && j < n) r[i][j] = true;
  };
  box(0, 0, 9, 9); // localizador + separador + formato (arriba a la izquierda)
  box(0, n - 8, 9, 8); // localizador + separador (arriba a la derecha) + fila 8 de formato
  box(n - 8, 0, 8, 9); // localizador + separador (abajo a la izquierda) + columna 8 de formato y módulo oscuro
  box(6, 0, 1, n); // temporización horizontal
  box(0, 6, n, 1); // temporización vertical
  const a = ALIGN[version];
  for (const ci of a) {
    for (const cj of a) {
      const overlapsFinder = (ci === 6 && cj === 6) || (ci === 6 && cj === a[a.length - 1]) || (ci === a[a.length - 1] && cj === 6);
      if (!overlapsFinder) box(ci - 2, cj - 2, 5, 5);
    }
  }
  if (version >= 7) {
    box(0, n - 11, 6, 3); // información de versión arriba a la derecha
    box(n - 11, 0, 3, 6); // y abajo a la izquierda
  }
  return r;
}

/** Lee los 15 bits de formato de una copia; devuelve la máscara si la cadena está en la tabla publicada. */
function readFormatMask(m, copy) {
  const n = m.length;
  // Posiciones [fila, columna] del bit 14 (más significativo) al bit 0, según la norma.
  const cells =
    copy === 1
      ? [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]]
      : [[n - 1, 8], [n - 2, 8], [n - 3, 8], [n - 4, 8], [n - 5, 8], [n - 6, 8], [n - 7, 8], [8, n - 8], [8, n - 7], [8, n - 6], [8, n - 5], [8, n - 4], [8, n - 3], [8, n - 2], [8, n - 1]];
  const s = cells.map(([i, j]) => (m[i][j] ? '1' : '0')).join('');
  const mask = FORMAT_M.indexOf(s);
  assert.notEqual(mask, -1, `copia ${copy} del formato no está en la tabla: ${s}`);
  return mask;
}

function readQr(m) {
  const n = m.length;
  const version = (n - 17) / 4;
  assert.ok(Number.isInteger(version) && version >= 1 && version <= 10, `tamaño ${n}`);
  const mask = readFormatMask(m, 1);
  assert.equal(readFormatMask(m, 2), mask, 'las dos copias del formato coinciden');
  assert.equal(m[n - 8][8], true, 'módulo oscuro');
  const reserved = reservedMap(version);
  // Zigzag: parejas de columnas de derecha a izquierda (saltando la columna 6), alternando sentido.
  const bits = [];
  let upward = true;
  for (let right = n - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let k = 0; k < n; k++) {
      const i = upward ? n - 1 - k : k;
      for (const j of [right, right - 1]) if (!reserved[i][j]) bits.push(m[i][j] !== MASK[mask](i, j));
    }
    upward = !upward;
  }
  const [ec, groups] = BLOCKS[version];
  const lens = groups.flatMap(([count, len]) => new Array(count).fill(len));
  const total = lens.reduce((a, b) => a + b, 0) + ec * lens.length;
  assert.ok(bits.length >= total * 8, 'hay sitio para todos los codewords');
  const cw = [];
  for (let k = 0; k < total; k++) cw.push(bits.slice(k * 8, k * 8 + 8).reduce((a, b) => (a << 1) | (b ? 1 : 0), 0));
  const blocks = lens.map(() => ({ d: [], e: [] }));
  let p = 0;
  for (let k = 0; k < Math.max(...lens); k++) lens.forEach((len, b) => k < len && blocks[b].d.push(cw[p++]));
  for (let k = 0; k < ec; k++) blocks.forEach((b) => b.e.push(cw[p++]));
  // La corrección se comprueba con la división polinómica de este lector (no la del codificador).
  for (const b of blocks) assert.deepEqual(syndromeFree(b.d, b.e), true, 'corrección del bloque');
  const stream = blocks.flatMap((b) => b.d).flatMap((byte) => [7, 6, 5, 4, 3, 2, 1, 0].map((s) => (byte >>> s) & 1));
  const take = (k) => stream.splice(0, k).reduce((a, b) => (a << 1) | b, 0);
  assert.equal(take(4), 0b0100, 'modo byte');
  const len = take(version < 10 ? 8 : 16);
  return { version, mask, text: new TextDecoder().decode(Uint8Array.from({ length: len }, () => take(8))) };
}

// Aritmética de GF(256) con tablas de exponentes (otra forma de calcular que la del codificador).
const EXP = new Array(512);
const LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++, x = (x << 1) ^ (x & 0x80 ? 0x11d : 0)) {
  EXP[i] = x & 0xff;
  LOG[x & 0xff] = i;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** Un bloque es válido si el polinomio datos+corrección se anula en α^0 … α^(ec-1) (síndromes nulos). */
function syndromeFree(d, e) {
  const word = [...d, ...e];
  for (let k = 0; k < e.length; k++) {
    let s = 0;
    for (const c of word) s = mul(s, EXP[k]) ^ c;
    if (s !== 0) return false;
  }
  return true;
}

test('ida y vuelta con el lector independiente: versiones 1 a 10, UTF-8 y las dos copias del formato', () => {
  const samples = [
    'ABC123',
    'https://x.dev/?sala=ABC123',
    'https://algo-largo-de-prueba.trycloudflare.com/?sala=HJK234',
    `https://servidor.example/?sala=MNP567&r=${'q'.repeat(60)}`,
    `https://e.example/${'z'.repeat(100)}`,
    `https://e.example/${'z'.repeat(140)}`,
    'é'.repeat(100), // UTF-8 de 2 bytes por carácter: 200 bytes, versión 10
  ];
  const versions = new Set();
  for (const text of samples) {
    const q = encodeQr(text);
    const r = readQr(q.modules);
    assert.equal(r.text, text);
    assert.equal(r.version, q.version);
    assert.equal(r.mask, q.mask);
    versions.add(r.version);
  }
  assert.ok([...versions].some((v) => v >= 7) && versions.has(10), `versiones ${[...versions]}`);
});

test('el lector rechaza un QR con un bloque dañado (la comprobación de corrección no es vacua)', () => {
  const q = encodeQr('https://x.dev/?sala=ABC123');
  const m = q.modules.map((row) => row.slice());
  const n = m.length;
  m[n - 1][n - 1] = !m[n - 1][n - 1]; // primer bit de datos
  assert.throws(() => readQr(m), /corrección del bloque|modo byte/);
});

test('patrones fijos: localizadores, separadores, temporización y módulo oscuro', () => {
  const { modules: m, size } = encodeQr('https://x.dev/?sala=ABC123');
  const finder = (r0, c0) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const d = Math.max(Math.abs(i - 3), Math.abs(j - 3));
        assert.equal(m[r0 + i][c0 + j], d !== 2, `localizador en ${r0},${c0}`);
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  for (let k = 0; k < 8; k++) {
    assert.equal(m[7][k], false, 'separador');
    assert.equal(m[k][7], false, 'separador');
  }
  for (let k = 8; k < size - 8; k++) {
    assert.equal(m[6][k], k % 2 === 0, 'temporización horizontal');
    assert.equal(m[k][6], k % 2 === 0, 'temporización vertical');
  }
});

test('SVG: zona de silencio de 4 módulos, fondo blanco y etiqueta escapada', () => {
  const svg = qrSvg('ABC', { label: 'Sala <ABC>' });
  const { size } = encodeQr('ABC');
  assert.match(svg, new RegExp(`viewBox="0 0 ${size + 8} ${size + 8}"`));
  assert.match(svg, /fill="#fff"/);
  assert.match(svg, /aria-label="Sala &#60;ABC&#62;"/);
  assert.doesNotMatch(svg, /<ABC>/);
});
