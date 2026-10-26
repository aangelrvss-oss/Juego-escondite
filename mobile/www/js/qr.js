// Codificador QR mínimo (ISO/IEC 18004) para el enlace de invitación: modo byte, corrección M y
// versiones 1 a 10 (hasta 213 bytes, de sobra para una URL con el código de sala). Sin dependencias
// y sin red: el QR se genera en el móvil del anfitrión. Puro, se prueba en Node.

const EC_M = 0; // bits de formato del nivel M

// Por versión (índice = versión): codewords de corrección por bloque y bloques [cuántos, datos].
const BLOCKS_M = [
  null,
  { ec: 10, groups: [[1, 16]] },
  { ec: 16, groups: [[1, 28]] },
  { ec: 26, groups: [[1, 44]] },
  { ec: 18, groups: [[2, 32]] },
  { ec: 24, groups: [[2, 43]] },
  { ec: 16, groups: [[4, 27]] },
  { ec: 18, groups: [[4, 31]] },
  { ec: 22, groups: [[2, 38], [2, 39]] },
  { ec: 22, groups: [[3, 36], [2, 37]] },
  { ec: 26, groups: [[4, 43], [1, 44]] },
];
const ALIGNMENT = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
export const MAX_VERSION = 10;

// ------------------------------------------------------------------ Reed-Solomon en GF(256), 0x11D

function gfMul(a, b) {
  let r = 0;
  for (let i = 7; i >= 0; i--) {
    r = (r << 1) ^ ((r >>> 7) * 0x11d);
    r ^= ((b >>> i) & 1) * a;
  }
  return r & 0xff;
}

function rsDivisor(degree) {
  const out = new Array(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j], root);
      if (j + 1 < degree) out[j] ^= out[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return out;
}

/** Codewords de corrección (resto de dividir los datos por el polinomio generador). */
export function rsRemainder(data, degree) {
  const divisor = rsDivisor(degree);
  const out = new Array(degree).fill(0);
  for (const b of data) {
    const factor = b ^ out.shift();
    out.push(0);
    for (let i = 0; i < degree; i++) out[i] ^= gfMul(divisor[i], factor);
  }
  return out;
}

// ------------------------------------------------------------------ información de formato y versión

/** 15 bits de formato (nivel M + máscara) con su BCH y la máscara fija 0x5412. */
export function formatBits(mask) {
  const data = (EC_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** 18 bits de versión (solo versiones 7 en adelante). */
export function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

const bit = (x, i) => ((x >>> i) & 1) !== 0;

// ------------------------------------------------------------------ datos

function dataCapacity(version) {
  return BLOCKS_M[version].groups.reduce((n, [count, len]) => n + count * len, 0);
}

/** Versión mínima para `byteLength` bytes en modo byte, o null si no cabe en la versión 10. */
export function versionFor(byteLength) {
  for (let v = 1; v <= MAX_VERSION; v++) {
    const countBits = v < 10 ? 8 : 16;
    if (4 + countBits + byteLength * 8 <= dataCapacity(v) * 8) return v;
  }
  return null;
}

/** Codewords de datos en modo byte (modo, longitud, bytes, terminador y relleno 0xEC/0x11). */
export function dataCodewords(bytes, version) {
  const bits = [];
  const push = (value, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capacityBits = dataCapacity(version) * 8;
  push(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < dataCapacity(version); pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/** Datos y corrección repartidos en bloques e intercalados, tal como se colocan en la matriz. */
export function interleave(data, version) {
  const { ec, groups } = BLOCKS_M[version];
  const blocks = [];
  let k = 0;
  for (const [count, len] of groups) {
    for (let i = 0; i < count; i++) {
      const d = data.slice(k, k + len);
      k += len;
      blocks.push({ d, e: rsRemainder(d, ec) });
    }
  }
  const out = [];
  const maxLen = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

// ------------------------------------------------------------------ matriz

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];
export const maskAt = (mask, x, y) => MASKS[mask](x, y);

function grid(size, value) {
  return Array.from({ length: size }, () => new Array(size).fill(value));
}

/** Matriz con los patrones fijos. `fn[y][x]` marca los módulos que no llevan datos. */
export function functionPatterns(version) {
  const size = version * 4 + 17;
  const m = grid(size, false);
  const fn = grid(size, false);
  const set = (x, y, dark) => {
    m[y][x] = dark;
    fn[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const pos = ALIGNMENT[version];
  for (let i = 0; i < pos.length; i++) {
    for (let j = 0; j < pos.length; j++) {
      const corner = (i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0);
      if (corner) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  placeFormat(m, fn, 0); // reserva (se reescribe con la máscara elegida)
  if (version >= 7) {
    const v = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, bit(v, i));
      set(b, a, bit(v, i));
    }
  }
  return { size, m, fn };
}

function placeFormat(m, fn, mask) {
  const size = m.length;
  const bits = formatBits(mask);
  const set = (x, y, dark) => {
    m[y][x] = dark;
    fn[y][x] = true;
  };
  for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i));
  set(8, 7, bit(bits, 6));
  set(8, 8, bit(bits, 7));
  set(7, 8, bit(bits, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(bits, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(bits, i));
  set(8, size - 8, true); // módulo oscuro fijo
}

/** Orden de colocación de los bits de datos: columnas de dos en zigzag, de derecha a izquierda. */
export function dataPositions(fn) {
  const size = fn.length;
  const out = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fn[y][x]) out.push([x, y]);
      }
    }
  }
  return out;
}

function penalty(m) {
  const size = m.length;
  let score = 0;
  const lines = [];
  for (let y = 0; y < size; y++) lines.push(m[y]);
  for (let x = 0; x < size; x++) lines.push(m.map((row) => row[x]));
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    // Patrón parecido al de los localizadores (1:1:3:1:1) con 4 módulos claros a un lado.
    const s = line.map((d) => (d ? '1' : '0')).join('');
    for (const p of ['10111010000', '00001011101']) for (let i = s.indexOf(p); i !== -1; i = s.indexOf(p, i + 1)) score += 40;
  }
  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
    }
  }
  const dark = m.flat().filter(Boolean).length;
  score += Math.floor(Math.abs((dark * 20) / (size * size) - 10)) * 10;
  return score;
}

/**
 * Matriz QR (true = módulo oscuro) para un texto. Elige la versión mínima y la máscara con menor
 * penalización. Lanza un error si el texto no cabe en la versión 10.
 */
export function encodeQr(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  const version = versionFor(bytes.length);
  if (version === null) throw new Error('qr_too_long');
  const codewords = interleave(dataCodewords(bytes, version), version);
  const base = functionPatterns(version);
  const positions = dataPositions(base.fn);
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = base.m.map((row) => row.slice());
    const fn = base.fn.map((row) => row.slice());
    positions.forEach(([x, y], i) => {
      const dark = i < codewords.length * 8 ? bit(codewords[i >>> 3], 7 - (i & 7)) : false;
      m[y][x] = dark !== maskAt(mask, x, y);
    });
    placeFormat(m, fn, mask);
    const p = penalty(m);
    if (!best || p < best.p) best = { p, m, mask };
  }
  return { version, mask: best.mask, size: best.m.length, modules: best.m };
}

/** SVG del QR con margen de 4 módulos (zona de silencio), fondo claro y módulos oscuros. */
export function qrSvg(text, { label = 'Código QR' } = {}) {
  const { size, modules } = encodeQr(text);
  const q = 4;
  const n = size + q * 2;
  let path = '';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) path += `M${x + q} ${y + q}h1v1h-1z`;
  const safe = String(label).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<svg class="qr" viewBox="0 0 ${n} ${n}" role="img" aria-label="${safe}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
