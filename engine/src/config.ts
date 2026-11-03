import { LIMITS } from './constants.ts';
import { isValidLatLng } from './geo.ts';
import { isModeId } from './modes.ts';
import type { GameConfig } from './types.ts';

function inRange(value: number, range: { min: number; max: number }): boolean {
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

// Devuelve el nombre del primer campo inválido, o null si la configuración es válida.
export function validateConfig(config: GameConfig): string | null {
  if (config.mode !== undefined && !isModeId(config.mode)) return 'mode';
  if (!inRange(config.durationMs, LIMITS.durationMs)) return 'durationMs';
  if (!inRange(config.headStartMs, LIMITS.headStartMs)) return 'headStartMs';
  if (!inRange(config.pingIntervalMs, LIMITS.pingIntervalMs)) return 'pingIntervalMs';
  // La primera pista llega un intervalo después de empezar la persecución: con un intervalo igual o
  // mayor que la duración no llegaría ninguna.
  if (config.pingIntervalMs >= config.durationMs) return 'pingIntervalMs';
  if (!Array.isArray(config.zone) || config.zone.length < 1) return 'zone';
  if (config.zone.length > LIMITS.maxZoneVersions) return 'zone';
  for (const version of config.zone) {
    if (version.fromOffsetMs !== 0) return 'zone';
    if (!isValidLatLng(version.center)) return 'zone';
    if (!inRange(version.radiusM, LIMITS.zoneRadiusM)) return 'zone';
  }
  if (!config.meetingPoint || !isValidLatLng(config.meetingPoint)) return 'meetingPoint';
  if (typeof config.safetyChecklistConfirmed !== 'boolean') return 'safetyChecklistConfirmed';
  return null;
}

export function validateName(name: string): string | null {
  // También protege createRoom, que recibe el nombre del anfitrión sin pasar por applyCommand.
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (trimmed.length < LIMITS.nameLength.min || trimmed.length > LIMITS.nameLength.max) return null;
  return trimmed;
}
