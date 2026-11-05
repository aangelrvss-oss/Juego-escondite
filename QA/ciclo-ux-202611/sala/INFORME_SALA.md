# Sala de espera: preparación y flujo guiado (ciclo UX 11/2026, agente 2)

Rama `mapa-real`, base `7d8b5a9`. Sin commit.

## Causa raíz

- `engine/src/engine.ts:683` (en `7d8b5a9`), caso `configure`: cualquier `configure` válido hacía
  `for (const lp of lobbyPlayers(s)) lp.ready = false;`, aunque no cambiara nada que afecte a la partida.
- `mobile/www/js/app.js:1260-1283` (`configure()`) envía la configuración **entera** ante cualquier cambio, y
  `app.js:1307` enviaba un `configure` al marcar la casilla de seguridad (`safetyChecklistConfirmed` forma
  parte de `GameConfig`). Recentrar la zona (`center`, `app.js:1394`) también enviaba `configure`.
- Resultado: marcar la lista de seguridad, recentrar unos metros o reenviar lo mismo obligaba a **todos**
  (incluido el anfitrión) a volver a pulsar «Estoy listo».

No se puede resolver solo en el cliente: el «listo» lo guarda y lo resetea el motor, y `start()`
(`engine.ts`, `players_not_ready`) lo exige. Aunque el cliente enviara menos `configure`, la casilla de
seguridad viaja dentro de la configuración y su `configure` seguía reseteando a todos.

Otros reseteos revisados y **sin cambios** (correctos): `backToLobby` (cuenta atrás anulada: se explica con
`lobbyNotice`), `start` (al empezar), `removePlayer`, revancha, y la plaza reclamada en `join`
(`reclaimed.ready = false`, la plaza antigua sale de la sala).

## Política de invalidación (motor, `isMaterialChange` en `engine/src/engine.ts`)

Solo un cambio material quita el «listo», y solo a los **demás** jugadores (el anfitrión que hace el cambio
ya lo conoce). Mismo evento `config_updated`, protocolo WebSocket intacto.

| Cambio | ¿Invalida? | Por qué |
|---|---|---|
| Primera configuración (null → config) | Sí | Nadie ha visto aún las reglas |
| Modo (sin campo = Clásico) | Sí | Cambian roles y victoria |
| `durationMs`, `headStartMs`, `pingIntervalMs` | Sí | Cambian los tiempos aceptados |
| Radio inicial, `dynamicZone`, nº/versiones de zona | Sí | Cambia el terreno de juego |
| Centro de zona o punto de encuentro ≥ 50 m (`distanceM` de `geo.ts`) | Sí | Es otro sitio |
| Centro / punto de encuentro < 50 m | No | Reajuste del GPS del anfitrión |
| Marcar o desmarcar la lista de seguridad | No | La confirma el anfitrión; `start` sigue exigiéndola |
| Reenviar la misma configuración (también sin `headStartMs` = valor por defecto) | No | Nada cambia |
| Nombres, asignar rol, preferencia propia | No | No pasan por `configure` (ya no invalidaban) |
| Entrar/salir otro jugador, copiar enlace, QR, cambiar código | No | No tocan la configuración |
| Desconexión | No (solo a ese jugador, de hecho) | `start` ya exige `connected` |
| `configure` rechazado o de un no anfitrión | No | El comando no deja rastro |

El cliente deduce el reseteo comparando dos instantáneas (`readyResetNotice`): si estaba listo, deja de
estarlo y la configuración cambió de forma material, ve «El anfitrión ha cambiado el modo y la persecución.
Revisa la partida y vuelve a pulsar «Estoy listo»» (reutiliza `lobbyNotice`, con `aria-live` vía `announce`).

## Flujo nuevo (sala guiada)

Barra de 4 pasos (`lobbySteps`), solo uno «actual».

1. **Configurar (anfitrión)**: al entrar sin configuración, la zona se centra **sola** en su posición
   (`maybeAutoCenter`, una vez) y se envía la configuración con los valores del borrador (modo elegido en el
   inicio, 500 m, 20 min, 2 min de huida, pistas cada 3 min, zona que se cierra). Si el GPS falla: error
   comprensible (`gpsCheckError(code, 'Centrar la zona aquí')`) y botón «Centrar la zona aquí». Después, un
   resumen compacto con «Cambiar» (despliega modo, radio, persecución, huida, pistas y una frase sobre la
   huida, las pistas y la zona que se cierra; avisa si el cambio quitará el «listo» a los demás) y «Volver a
   centrar».
2. **Invitar**: código, «Compartir enlace», «Mostrar QR», «Cambiar el código» (anfitrión).
3. **Estoy listo (jugadores)**: mismo `locateOnce` de antes. El error queda bajo el botón (`role="alert"`),
   no solo en un aviso pasajero: permiso denegado, sin señal (`position_unavailable`, texto nuevo), tiempo
   agotado. Sin conexión: banner existente `connectionNotice`. **Sin zona fijada el botón está deshabilitado**
   («Espera a que el anfitrión fije la zona»), porque la primera configuración quitaría el «listo».
4. **Sala preparada**: lista con estado y motivo por jugador (`playerReadiness`: «Listo», «Falta confirmar»,
   «Sin conexión», «Invitado», anfitrión «se confirma al empezar»), barra y contador «2 de 3 listos»
   (`readyProgress`, sin el anfitrión), bloqueos concretos (`startBlockers(..., { atStart: true })`, con los
   mínimos por modo: Clásico 2, Caza del zorro 3, Infección 4). Rol y expulsar en una fila secundaria tras
   «Gestionar jugadores». Los jugadores ven su botón arriba, el resumen explicado (`configSummary`) y qué falta.
5. **Empezar**: un único «Empezar partida» (habilitado sin bloqueos; fijo abajo cuando ya se puede). Abre una
   hoja con resumen (modo, zona, tiempos, nº de jugadores) y la lista de seguridad (`SAFETY_CHECKLIST`) con
   una casilla; «Empezar ya» se habilita al marcarla. Al pulsar (`startGame`): `configure` con
   `safetyChecklistConfirmed=true` (ya no invalida a nadie) → si el anfitrión no está listo, comprobación GPS
   + `set_ready` → `start`. Cada fallo se dice en la hoja, que sigue abierta, y lo ya hecho se conserva. El
   anfitrión nunca pulsa «Estoy listo» por separado, pero sí pasa la comprobación GPS.

Se mantienen el aviso de cuenta atrás anulada (`lobbyNotice`), el aviso nocturno y las reglas (plegadas).
La casilla de seguridad suelta de la configuración desaparece.

## Archivos modificados

- `engine/src/engine.ts`: `MATERIAL_MOVE_M`, `isMaterialChange`, caso `configure` (+ import `LatLng`).
- `engine/test/preparacion.test.ts` (nuevo, 20 pruebas).
- `engine/test/briefing-lock.test.ts`: la prueba «cambiar las reglas quita el listo a todos» esperaba que el
  anfitrión también lo perdiera; era el comportamiento defectuoso según la política. Ahora: lo pierde `r1`, lo
  conserva el anfitrión, y `start` sigue rechazado.
- `mobile/www/js/game-view.js`: `startBlockers` (opción `atStart`), `gpsCheckError` (botón a pulsar y «sin
  señal»), nuevas puras `SAFETY_CHECKLIST`, `configSummary`, `playerReadiness`, `readyProgress`,
  `lobbySteps`, `readyButton`, `MATERIAL_MOVE_M`, `configChanges`, `readyResetNotice`, `startSummary`.
- `mobile/www/js/app.js`: estado de la sala en `ui`, aviso de reseteo en `snapshot`, `playerRow`, `stepsBar`,
  `playersCard`, `lobbyScreen`, `summaryList`, `rulesCard`, `hostConfig`, `startSheet`, `configCommand`,
  `configure`, `centerZone`, `maybeAutoCenter`, `startGame`, acciones `ready`/`center`/`edit-config`/`manage`/
  `start`/`start-now`, casilla `start-safety`. No se tocan `finishedScreen` ni el inicio.
- `mobile/www/css/game.css`: bloque «sala guiada» al final (clases `lobby-*` para no chocar con `.steps` del
  inicio).
- `mobile/test/sala-preparacion.test.mjs` (nuevo, 11 pruebas).
- `QA/ciclo-ux-202611/sala/qa-sala.mjs`: guion Playwright reproducible.

## Pruebas (resultados reales)

- `npx tsc -p tsconfig.json`: sin errores.
- `npm test` (motor + sim): 297/297.
- `npm run test:server`: 136/136 (una ejecución intermedia falló 1 en `report.test.mjs` por
  `reportSurvival is not defined` en `missionReport`, trabajo en curso del agente del Mission Report; en la
  ejecución final pasa).
- `npm test --prefix mobile`: 207/207.
- Playwright (Chrome headless, servidor propio en 8821, geolocalización emulada, 360 y 412 px): 9/9
  comprobaciones, 0 errores de consola, sin desbordamiento horizontal. Recorrido: anfitrión sin permiso
  (error + botón) → jugador entra sin zona (botón deshabilitado) → permiso y centrado → 2.º jugador → ambos
  listos → recentrar 20 m (nadie pierde el listo) → modo Infección (los demás lo pierden, aviso explicando el
  cambio, bloqueo «Infección necesita al menos 4») → Caza del zorro, 30 min, listos otra vez → hoja de empezar
  (bloqueada hasta marcar seguridad) → «Empezar ya» → cuenta atrás en los tres móviles.

Capturas (`capturas/`): `01-anfitrion-sin-gps-360`, `02-jugador-espera-zona-412`,
`03-anfitrion-zona-centrada-360`, `04-anfitrion-todos-listos-360`, `05-jugador-cambio-material-412`,
`06-anfitrion-editar-infeccion-360`, `07-hoja-empezar-360`, `08-cuenta-atras-412`. En las capturas de página
completa, los avisos flotantes y el botón fijo aparecen sobre el contenido (artefacto de la captura).

## Pendientes

- Probar en móviles reales (permiso de ubicación nativo en la app Capacitor, `position_unavailable` real).
- `teams_unbalanced` y `room_expiring` no se anticipan en la sala: aparecen como error en la hoja de empezar.
- El servidor limita salas por IP (5): para repetir el guion de QA varias veces, arrancar con
  `MAX_ROOMS_PER_IP=50`.
- Documentar la política en `DECISION_LOG.md` (no tocado: no es de este agente).
