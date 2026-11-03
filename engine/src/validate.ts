// Validación estructural de los comandos que llegan al motor (frontera de entrada).
// Solo comprueba la forma: tipo de comando conocido, campos obligatorios, tipos primitivos y ausencia
// de campos extra. Los rangos y valores de juego (nombres, configuración, preferencias) los siguen
// validando los manejadores de engine.ts con sus códigos de error de siempre.

import type { Command } from './types.ts';

// Ningún texto de un comando legítimo se acerca a este tamaño (nombres ≤ 20, identificadores cortos).
export const MAX_STRING_LENGTH = 128;
// Holgado respecto a LIMITS.maxZoneVersions: el límite de juego lo aplica validateConfig.
const MAX_ZONE_VERSIONS = 32;

type Check = (value: unknown, path: string) => string | null;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str: Check = (v, path) => (typeof v === 'string' && v.length <= MAX_STRING_LENGTH ? null : path);
const num: Check = (v, path) => (typeof v === 'number' && Number.isFinite(v) ? null : path);
const bool: Check = (v, path) => (typeof v === 'boolean' ? null : path);
const optional = (check: Check): Check => (v, path) => (v === undefined ? null : check(v, path));

const field = (path: string, key: string): string => (path ? `${path}.${key}` : key);

// Objeto con exactamente estos campos (los opcionales pueden faltar); cualquier otro campo se rechaza.
function shape(fields: Record<string, Check>): Check {
  return (v, path) => {
    if (!isRecord(v)) return path;
    for (const key of Object.keys(v)) if (!Object.hasOwn(fields, key)) return field(path, key);
    for (const [key, check] of Object.entries(fields)) {
      const bad = check(v[key], field(path, key));
      if (bad) return bad;
    }
    return null;
  };
}

const latLng = shape({ lat: num, lng: num });

const zoneList: Check = (v, path) => {
  if (!Array.isArray(v) || v.length > MAX_ZONE_VERSIONS) return path;
  const version = shape({ fromOffsetMs: num, center: latLng, radiusM: num });
  for (let i = 0; i < v.length; i++) {
    const bad = version(v[i], `${path}[${i}]`);
    if (bad) return bad;
  }
  return null;
};

const COMMANDS: Record<Command['type'], Record<string, Check>> = {
  join: { name: str, deviceId: str },
  connection: { connected: bool },
  seen: {},
  set_team_pref: { pref: str },
  assign_team: { targetId: str, pref: str },
  set_ready: { ready: bool },
  configure: {
    config: shape({
      mode: optional(str),
      durationMs: num,
      headStartMs: optional(num),
      pingIntervalMs: num,
      zone: zoneList,
      dynamicZone: optional(bool),
      meetingPoint: latLng,
      safetyChecklistConfirmed: bool,
    }),
  },
  kick: { targetId: str },
  start: {},
  abort: {},
  cancel: {},
  end_game: {},
  location: { sample: shape({ lat: num, lng: num, accuracyM: num, measuredAt: num, isMock: optional(bool) }) },
  claim_tag: { runnerId: str },
  respond_tag: { claimId: str, accept: bool },
  self_tag: { hunterId: optional(str) },
  leave: {},
  rematch: { swapRoles: bool },
  join_rematch: {},
};

/**
 * Devuelve null si `cmd` tiene la forma de un comando válido, o la ruta del primer campo inválido
 * (por ejemplo `config.zone[0]` o `type`). La ruta no incluye valores, solo nombres de campos.
 */
export function invalidCommandField(cmd: unknown): string | null {
  if (!isRecord(cmd) || typeof cmd.type !== 'string' || !Object.hasOwn(COMMANDS, cmd.type)) return 'type';
  const { type: _type, ...fields } = cmd;
  return shape(COMMANDS[cmd.type as Command['type']])(fields, '');
}
