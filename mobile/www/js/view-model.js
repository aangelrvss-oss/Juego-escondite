// Modelo de la pantalla de diagnóstico: convierte el estado (permisos, proveedor, sesión y última
// lectura) en textos y tonos. Puro (sin DOM): se prueba en Node.
import { LABELS, classify, formatAge, statusLabel } from './reading-status.js';

export const PERMISSION_TEXT = Object.freeze({
  precise: { text: 'Precisa concedida', tone: 'ok' },
  approximate: { text: 'Solo aproximada: la precisión no bastará para jugar', tone: 'warn' },
  denied: { text: 'Denegada', tone: 'danger' },
  denied_permanently: { text: 'Denegada de forma permanente: actívala en Ajustes', tone: 'danger' },
  prompt: { text: 'Sin pedir todavía', tone: 'muted' },
});

export const NOTIFICATION_TEXT = Object.freeze({
  granted: { text: 'Permitidas', tone: 'ok' },
  denied: { text: 'Denegadas: no verás el aviso de que se está usando la ubicación', tone: 'warn' },
  prompt: { text: 'Sin pedir todavía', tone: 'muted' },
  not_required: { text: 'No hace falta pedirlas en esta versión de Android', tone: 'ok' },
});

export const ERROR_TEXT = Object.freeze({
  unavailable: 'El módulo de ubicación solo funciona dentro de la app Android.',
  permission_missing: 'Falta el permiso de ubicación.',
  provider_disabled: 'La ubicación del sistema está desactivada. Actívala en los ajustes rápidos.',
  service_start_denied: 'Android no permitió iniciar la recopilación. Ábrela con la app en pantalla.',
  session_file_error: 'No se pudo crear o escribir el registro de la sesión.',
  request_updates_denied: 'Android rechazó la petición de ubicación.',
  already_running: 'Ya hay una sesión en curso.',
  not_running: 'No hay ninguna sesión en curso.',
  invalid_interval: 'Intervalo no válido.',
  no_session: 'Todavía no hay ninguna sesión que exportar.',
  export_cancelled: 'Exportación cancelada.',
  export_failed: 'No se pudo exportar el registro.',
  service_destroyed: 'Android detuvo el servicio de ubicación sin que lo pidieras.',
  abnormal_end: 'La sesión anterior terminó sin detenerse (proceso cerrado, permiso retirado o reinicio).',
  native_error: 'Error del módulo nativo.',
});

export const errorText = (code) => ERROR_TEXT[code] ?? `Error: ${code}`;

export function permissionView(p) {
  return {
    location: PERMISSION_TEXT[p.location] ?? PERMISSION_TEXT.prompt,
    notifications: NOTIFICATION_TEXT[p.notifications] ?? NOTIFICATION_TEXT.prompt,
    canRequest: p.location === 'prompt' || p.location === 'denied' || p.location === 'approximate' || p.notifications === 'prompt',
    needsSettings: p.location === 'denied_permanently',
    canStart: p.location === 'precise' || p.location === 'approximate',
  };
}

export function providerView(pr) {
  if (!pr.locationEnabled) return { text: 'Ubicación del sistema desactivada', tone: 'danger' };
  const name = pr.provider === 'fused' ? 'fusionado (GPS + red + sensores)' : pr.provider === 'gps' ? 'solo GPS' : 'sin proveedor';
  return { text: `Activada · proveedor ${name}`, tone: pr.provider ? 'ok' : 'warn' };
}

/** Indicador de recopilación: siempre visible y explícito. */
export function collectingView(status) {
  return status.running
    ? { text: 'Recopilando ubicación ahora · notificación activa mientras dure la sesión', tone: 'live' }
    : { text: 'No se está recopilando ubicación', tone: 'muted' };
}

/**
 * Última lectura. Sin lectura, o si ya no hay sesión, se dice expresamente: nunca se deja en
 * pantalla una posición antigua como si fuera actual.
 */
export function readingView(reading, nowMs, { showCoordinates = false } = {}) {
  const c = classify(reading, nowMs);
  const label = statusLabel(c);
  const tone = c.availability === 'CURRENT' ? 'ok' : c.availability === 'STALE' ? 'warn' : 'danger';
  if (!reading) {
    return { label, tone, age: '—', accuracy: '—', accuracyLabel: 'Sin lectura', provider: '—', speed: '—', mock: null, coordinates: null, hint: 'Todavía no hay ninguna lectura en esta sesión.' };
  }
  const accuracyText = reading.accuracyM === null ? 'Desconocida' : `±${Math.round(reading.accuracyM)} m`;
  let hint = null;
  if (c.availability === 'UNAVAILABLE') hint = 'La última lectura es demasiado antigua: no indica dónde estás ahora.';
  else if (label === 'Antigua') hint = 'Sin lecturas recientes: puede haberse perdido la señal.';
  else if (label === 'Imprecisa') hint = 'Lectura reciente pero imprecisa: no sirve como posición exacta.';
  return {
    label,
    tone,
    age: formatAge(c.ageMs),
    accuracy: accuracyText,
    accuracyLabel: LABELS.accuracy[c.accuracy],
    provider: reading.provider,
    speed: reading.speedMps === null ? '—' : `${reading.speedMps.toFixed(1)} m/s`,
    mock: reading.isMock ? 'Posición simulada por otra app (ubicación ficticia activa): no es una lectura real.' : null,
    coordinates: showCoordinates ? `${reading.lat.toFixed(5)}, ${reading.lng.toFixed(5)}` : null,
    hint,
  };
}

export function sessionView(status) {
  return {
    counts: `${status.fixes} lecturas · ${status.gaps} hueco${status.gaps === 1 ? '' : 's'}${status.gapOpen ? ' (hueco abierto ahora)' : ''}`,
    interval: `${Math.round(status.intervalMs / 1000)} s solicitados`,
    error: status.lastError ? errorText(status.lastError) : null,
    message: status.message,
  };
}
