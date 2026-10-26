# Trazabilidad con el Plan Maestro v1.0

**Fuente:** `THE_OUTRUN_Plan_Maestro_de_Producto_y_Desarrollo.pdf` (v1.0, 26/10/2026, 22 páginas; fuera del repositorio). Las referencias son «§sección / página».
**Fecha de esta matriz:** 26/10/2026, rama `recuperacion-h2` sobre `4c190a0`, con los cambios sin commit de F1/H2/H2.1 y del bloque de esta tarde (enlace, QR y cambio de código).
**Contradicciones con decisiones anteriores:** `DECISION_LOG.md`, D-043 a D-047 (sin resolver). Las decisiones del Plan se citan como `PM-D-xxx`.

Niveles de evidencia, de menos a más:
- **Impl.:** el código existe.
- **Auto.:** lo comprueban pruebas automáticas (con tiempo o ubicaciones simulados).
- **Integr.:** probado con el servidor real y clientes o navegadores reales en un ordenador.
- **Disp.:** validado en móviles reales.
- **Decisión:** bloqueado por una decisión del propietario.

Ninguna fase está **terminada** según su puerta de salida: todas exigen evidencia en dispositivos reales que todavía no existe.

| Fase | Funcionalidad (Plan) | Estado comprobado | Evidencia | Dependencias | Riesgo | Siguiente acción |
|---|---|---|---|---|---|---|
| F0 | Auditoría y congelación (§9 / 16) | Hecha la auditoría. La recuperación está en commits locales: `664cf53` (exacta) y `5611274` (ajuste de Windows), sin push. El trabajo posterior sigue sin commit, con respaldos en `Downloads\outrun-respaldo-*` | Informe de auditoría; `QUALITY_STATE.md` (bloque del 26/10, tarde) | — | Pérdida del trabajo posterior sin commit | Autorizar el commit de la invitación y del Mission Report |
| F1 | Modelo de sala y estados; sin doble inicio ni cambios tardíos (§9 / 16) | Impl. + Auto. + Integr. Faltan los estados CHECKS, BRIEFING y PAUSED (§2.3 / 5) | `engine/src/engine.ts` (`start` solo en LOBBY; `configure` solo en LOBBY); `engine/test/transitions.test.ts` | — | Bajo | Decidir el mapeo de CHECKS/BRIEFING/PAUSED |
| F1 | Eventos oficiales ordenados e idempotentes | Impl. + Auto. + Integr. (`seq` por destinatario, `cmd.id`) con otros nombres de evento | `server/hub.ts`; `server/test/multiplayer.test.mjs` | — | Bajo | Acordar los nombres de §9 F1 punto 8 |
| F1 | Presencia, reconexión, salida, fin y cancelación | Impl. + Auto. + Integr. **Disp.: no**. **Abandonar en mitad de la partida desde la interfaz (§4.5), añadido el 26/10:** `server/test/leave.test.mjs` y `web-flow.e2e.mjs` | `hub.ts` (`resume`); `mobile/test/lockscreen.test.mjs`; E2E de Playwright (documentada) | Móviles y HTTPS | Medio | Prueba con dos móviles (`mobile/PRUEBA_PARTIDA_ANDROID.md`) |
| F1 | Permisos GPS/micrófono y prototipo de radio en PWA | GPS: Impl. + Auto. + Integr. **Desde el 26/10, la ubicación se comprueba al pulsar «Estoy listo»** (explicación y motivo del fallo; sin permiso no se puede estar listo): `gps-check.test.mjs` y `web-flow.e2e.mjs`. Micrófono y radio: **ausentes** | — | **Decisión D-043** | Alto | Prototipo de voz si se confirma PM-D-003 |
| F1 | Pruebas del motor y entorno de staging | Pruebas: sí (130). Staging: **no existe** | `npm test` | Alojamiento (PM-D-008) | Medio | Decidir el alojamiento |
| F2 | Crear/unirse por **enlace o código**; lobby | Código: Impl. + Integr. **Enlace + QR + cambio de código: Impl. + Auto. + Integr. (26/10)**. Disp.: no | `mobile/www/js/qr.js`, `game-view.js` (`inviteLink`); `server/hub.ts` (`newCode`); `mobile/test/qr.test.mjs`, `invite.test.mjs`; `server/test/invite.test.mjs`; `mobile/e2e/web-flow.e2e.mjs` (Chrome real, 17/17 con la partida corta). QR sin escanear con una cámara ni con un lector de terceros | Escanear con una cámara real (AC-A6) | Bajo | Escanear el QR con un móvil |
| F2 | Asignar cazadores/fugitivos y briefing | Roles: Impl. + Auto. + Integr. Briefing: **parcial** (tarjeta de rol; sin reglas ni prohibiciones completas) | `engine/src/view.ts`; `sim/test/privacy.test.ts` | — | Medio | Pantalla de briefing |
| F2 | Zona, duración, criterio de captura; cuenta atrás sincronizada | Impl. + Auto. + Integr. Proporción de cazadores no configurable | `engine.ts`; `engine/test/start.test.ts`, `timing.test.ts` | — | Bajo | — |
| F2 | Posición/mapa y captura con tolerancia GPS | Impl. + Auto. **Disp.: no** (ni GPS real ni pantalla bloqueada). **Un salto aislado ya no valida una captura (D-049, §10)**: `engine/test/gps-jump.test.ts` | `engine.ts` (`claimTag`); `capture.test.ts`; `server/test/upload.test.mjs` | Móviles, HTTPS | **Alto** | Partida física |
| F2 | Final con victoria correcta y **Mission Report mínimo** | Final: Impl. + Auto. + Integr. **Mission Report mínimo útil (26/10): Impl. + Auto. + Integr.** Tiene resultado, causa, tiempo, capturas, ranking y momentos verificables; es igual para todos y se reconstruye tras reconectar. Faltan mapa/rutas y compartir (§4.4); el reparto de equipos al final depende de una decisión pendiente | `game-view.js` (`missionReport`); `engine/src/view.ts` (`activeStart`, `finishedAt`); `mobile/test/report.test.mjs`; `server/test/report.test.mjs`; `web-flow.e2e.mjs` | Decidir si se revelan los equipos al final | Bajo | Compartir el informe (imagen sin ubicación) |
| F2 | Radio privada integrada | **Ausente** | — | **Decisión D-043** | Alto | — |
| F2 | Ruta completa en móviles reales | **No hecha** (solo la sesión GPS de H1). Hay una ruta web completa en un navegador real de escritorio (`web-flow.e2e.mjs`), con la geolocalización emulada | `QUALITY_STATE.md` (H1-F1) | Servidor accesible por HTTPS; APK compilable (JDK/SDK no instalados en Windows) | **Alto** | Prueba de dos móviles |
| F3 | THE RACE | **Ausente** | — | HUNT validado; destinos seguros | — | No empezar hasta cerrar F2 |
| F4 | INFECTION | **Ausente** (solo diseño en `GAME_MODES_AND_RULES.md`) | — | F2, F3; **D-045** | — | — |
| F5 | FOX HUNT, SARDINES, FREEZE TAG, PURSUIT | Ausentes | — | F2–F4 | — | — |
| F6 | Modos experimentales | Ausentes (el radar SVG actual es solo visual) | — | F0–F5 | — | — |
| F7 | STREET LEGENDS | Ausente; no hay persistencia (salas en memoria) | `server/README.md` | Persistencia fiable | — | — |
| F8 | PWA instalable, accesibilidad, batería, radio con auriculares | PWA **ausente** (sin manifest ni service worker). Accesibilidad de `mobile/www` sin prueba equivalente a la de la demo | `mobile/www/index.html` | **Decisión D-044** | Medio | Manifest + SW mínimo si se acepta D-044 |
| F9 | Campo con 4–10 jugadores; release candidate | **No hecho**; la capacidad anunciada (20) no está probada | `engine/src/constants.ts` | **D-046** | Alto | — |
