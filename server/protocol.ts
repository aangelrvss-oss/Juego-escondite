// Protocolo cliente ↔ servidor de THE OUTRUN (JSON sobre WebSocket). Contrato común para Android,
// iOS y navegador: ningún mensaje depende de la plataforma.
//
// Cliente → servidor (campo `t`):
//   create  { name, installId }                  crea una sala; el creador es el anfitrión
//   join    { code, name, installId }            entra en una sala por su código
//   resume  { playerId, secret, lastSeq }        recupera la sesión tras una desconexión
//   cmd     { id, cmd }                          comando del motor (id: idempotencia). Además,
//                                                { type: 'new_code' } lo resuelve el servidor: el
//                                                anfitrión cambia el código en la sala de espera
//                                                (Plan Maestro §2.2)
//   loc     { lat, lng, acc, age, mock? }        lectura de ubicación; `age` = ms desde la medida
//   ping    { c }                                sincronización de reloj (c = hora del cliente)
//
// Servidor → cliente:
//   welcome  { playerId, secret, code }          solo a quien creó la sesión
//   snapshot { seq, snapshot }                   vista autorizada completa (tras cada cambio)
//   event    { seq, type, at, data }             evento filtrado por destinatario, seq contiguo
//   positions{ at, positions }                   posiciones autorizadas (cada 5 s en partida)
//   result   { id, result }                      respuesta a un `cmd`
//   code     { code }                            nuevo código de la sala (el anterior ya no sirve)
//   pong     { c, s }                            s = hora del servidor
//   error    { error }                           error de protocolo (sin datos privados)
//
// HTTP (envío nativo de la app con la pantalla bloqueada, cuando la interfaz puede estar dormida):
//   POST /api/loc { playerId, secret, lat, lng, acc, age, mock? }   misma lectura que `loc`, con la
//   sesión en el cuerpo (nunca en la URL, que sí puede acabar en registros de un túnel o proxy).
//   Respuestas: 204 aceptada · 202 ignorada (fuera de fase o demasiado seguida) · 400 mal formada ·
//   401 sesión no válida · 410 el jugador ya no comparte ubicación · 413 demasiado grande ·
//   403 origen no admitido · 429 demasiados fallos.

export const LIMITS = {
  maxMessageBytes: 4_096,
  maxText: 64,
  maxSecret: 128,
  maxAgeMs: 10 * 60_000, // una lectura más antigua no sirve para nada en partida
  maxUploadBytes: 1_024, // cuerpo de POST /api/loc
} as const;

export interface LocationUpload {
  playerId: string;
  secret: string;
  lat: number;
  lng: number;
  acc: number;
  age: number;
  mock?: boolean;
}

export type ClientMessage =
  | { t: 'create'; name: string; installId: string }
  | { t: 'join'; code: string; name: string; installId: string }
  | { t: 'resume'; playerId: string; secret: string; lastSeq: number }
  | { t: 'cmd'; id: string; cmd: unknown }
  | { t: 'loc'; lat: number; lng: number; acc: number; age: number; mock?: boolean }
  | { t: 'ping'; c: number };

type Check = (v: unknown) => boolean;
const text = (max: number): Check => (v) => typeof v === 'string' && v.length > 0 && v.length <= max;
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const int: Check = (v) => Number.isSafeInteger(v) && (v as number) >= 0;
const bool: Check = (v) => typeof v === 'boolean';
const any: Check = () => true;

const SHAPES: Record<ClientMessage['t'], Record<string, Check>> = {
  create: { name: text(LIMITS.maxText), installId: text(LIMITS.maxText) },
  join: { code: text(16), name: text(LIMITS.maxText), installId: text(LIMITS.maxText) },
  resume: { playerId: text(LIMITS.maxText), secret: text(LIMITS.maxSecret), lastSeq: int },
  cmd: { id: text(LIMITS.maxText), cmd: any }, // la forma del comando la valida el motor
  loc: { lat: num, lng: num, acc: num, age: num, mock: bool },
  ping: { c: num },
};
const UPLOAD: Record<string, Check> = {
  playerId: text(LIMITS.maxText),
  secret: text(LIMITS.maxSecret),
  lat: num,
  lng: num,
  acc: num,
  age: num,
  mock: bool,
};
const OPTIONAL = new Set(['loc.mock', 'upload.mock']);

function parseObject(raw: string, maxBytes: number): Record<string, unknown> | null {
  if (raw.length > maxBytes) return null;
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) return null;
  return msg as Record<string, unknown>;
}

/** Comprueba que `m` tiene exactamente los campos de `shape` (salvo `skip`) y con su tipo. */
function matches(m: Record<string, unknown>, shape: Record<string, Check>, name: string, skip: string | null): boolean {
  for (const key of Object.keys(m)) if (key !== skip && !Object.hasOwn(shape, key)) return false;
  for (const [key, check] of Object.entries(shape)) {
    if (m[key] === undefined && OPTIONAL.has(`${name}.${key}`)) continue;
    if (!check(m[key])) return false;
  }
  return true;
}

/** Analiza un mensaje de texto. Devuelve el mensaje o null si no cumple el protocolo. */
export function parseClientMessage(raw: string): ClientMessage | null {
  const m = parseObject(raw, LIMITS.maxMessageBytes);
  if (!m || typeof m.t !== 'string' || !Object.hasOwn(SHAPES, m.t)) return null;
  return matches(m, SHAPES[m.t as ClientMessage['t']], m.t, 't') ? (m as ClientMessage) : null;
}

/** Analiza el cuerpo de POST /api/loc. Devuelve la lectura o null si no cumple el protocolo. */
export function parseLocationUpload(raw: string): LocationUpload | null {
  const m = parseObject(raw, LIMITS.maxUploadBytes);
  return m && matches(m, UPLOAD, 'upload', null) ? (m as unknown as LocationUpload) : null;
}
