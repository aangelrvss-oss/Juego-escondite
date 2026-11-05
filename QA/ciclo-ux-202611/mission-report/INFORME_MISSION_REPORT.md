# Mission Report y estadísticas · ciclo UX 11/2026 (Agente 4)

Rama `mapa-real`. Sin commit. No se han tocado `app.js`, `engine/`, `server/`, `game.css` ni `index.html`.

## 1. Auditoría (qué había)

- **Pantalla**: `mobile/www/js/app.js` `finishedScreen` (≈1052–1096) + `rosterHtml` (≈1098). Muestra «Tu partida»
  (`personalResult`), cabecera con ganador y motivo, 3 cifras (persecución, capturas, «hasta la victoria» o
  primera captura), «Momentos» (`highlights`), «Cronología» de capturas, jugadores por equipo y los botones
  `data-act="rematch"` (solo anfitrión; si no, «Esperando a que el anfitrión…»), `share-report`, `leave`.
- **Datos**: `game-view.js` `missionReport`, `contagionGroups`, `reportParticipants`, `personalResult`,
  `reportShareText`. Solo usan la instantánea oficial (`outcome`, `captures` con `atOffsetMs/runnerId/hunterId/via/converted`,
  `activeStart`, `finishedAt`, `players` con `team/status/leftReason`, `rulesVersion`).
- **Servidor** (`engine/src/view.ts`, `types.ts`, `engine.ts`): en FINISHED todos ven el equipo de todos y siguen
  en `players` quienes jugaron y salieron (`leftReason` `left|timeout|after_end`). Las capturas solo ocurren en
  ACTIVE. Causas de final (todas en `engine.ts`): `time_up` (ganador siempre `runner`, porque sin fugitivos ya
  habría terminado), `all_captured` (captura o conversión del último), `runners_abandoned` / `hunters_abandoned`
  (salida o 5 min sin conexión; sin ganador; también posible en la huida), `ended_by_host` (huida o persecución;
  sin ganador). El zorro se trata como `all_captured`/`runners_abandoned` con textos propios.
- **Reconstrucción**: la instantánea de reanudación trae todo lo necesario. Lo prueba `server/test/report.test.mjs`
  (mismo informe para todos y tras reconectar) y ahora también partidas reales (sección 5): 7/7 casos con el mismo
  informe para todos los jugadores y tras reconectar con la sesión guardada.

### Defectos encontrados (con evidencia)

1. **Captura repetida en «Momentos» (corregido)**. Clásico con una sola captura que acaba la partida: `highlights`
   daba «Primera captura: X a los 4:00» y «Captura decisiva: X por Y a los 4:00» (la misma) y la tercera cifra
   mostraba otra vez «Primera captura 4:00». Ahora solo «Captura decisiva» (test `momentos…` en report-view.test.mjs).
2. **Faltaban datos pedidos por §4.4**: duración total (con la huida), supervivencia por fugitivo, quién llegó al
   final, momento del final en la cronología. La cronología solo listaba capturas (añadido).
3. **Duplicación en la pantalla**: «Momentos» repetía como texto lo que ya estaba en la cronología (primera y
   decisiva). Ahora esas dos van como etiquetas en la cronología; «Momentos» queda para lo que no es un instante
   (contagio, más capturas, aguantaron hasta el final, último superviviente). El texto para compartir no cambia.
4. **Nombres incoherentes entre «Tu partida» y el informe** (menor, en app.js): `personalResult` recibe el `nameOf`
   local de app.js y el informe el oficial. Se mantiene igual en `missionReportScreen` (opción `nameOf`), por
   compatibilidad; no es un error de datos.
5. **Infección dice «captura(s)» en jugadores y «Tu partida»** («Ana · 1 captura», «Hiciste 1 captura») mientras
   la cifra dice «Infectados» y el destacado «Más infecciones». Pendiente: `modes.test.mjs` fija ese texto
   («Infectado a los 1:00 · 1 captura»); cambiarlo es decisión de producto.
6. **El informe desaparece al proponer la revancha** (motor: `rematch` pasa la sala a LOBBY y borra
   `captures/outcome`) y al cerrarse la sala a los 30 min (`rematchWindowMs`). Quien aún lo leía lo pierde. No se
   puede arreglar sin tocar motor/app.js; ver pendientes.
7. Fuera de mi alcance, anotado: falla `mobile/test/gps-check.test.mjs` «cualquier otro fallo da un mensaje útil»
   (`gpsCheckError` ya no dice «ubicación»): cambio de otro agente, no es del informe (en la última ejecución ya pasa).

Sin defectos de datos en los tres modos ni en las causas: ganador, motivo, duración, `timeToVictoryMs` y
participantes salen correctos en las 11 combinaciones probadas (sección 5).

## 2. Diseño nuevo

- **Cabecera** de cartel: «Mission Report · modo · Partida n», ganador enorme con el color del equipo, motivo y
  «Partida de 14:00 en total · 2:00 de huida» (o «Terminó durante la huida, a los 1:10»).
- **Cifras** (2×2 en 320–439 px, en fila desde 440): persecución, capturas/infectados, hasta la victoria o primera
  captura (lógica de siempre), y «Libres al final» / «Supervivientes» n/m (no en el zorro: lo dice la cabecera).
- **Momentos**: solo los no temporales (ver defecto 3).
- **Cronología**: 0:00 inicio · capturas (etiquetas Primera / Decisiva / Última, «autodeclarada») · final con el
  motivo (o «Huida» si terminó antes de la persecución).
- **Rendimiento** (sustituye a la lista de jugadores, misma información + barras): por equipo; fugitivos con barra
  de tiempo libre sobre la persecución (y el tiempo si siguió libre), cazadores con barra de capturas sobre el que
  más hizo; «Tú» marcado. Quien abandonó no tiene tiempo (la instantánea no dice cuándo salió: no se inventa).
- **Tu historial** (plegado, al final): solo si hay partidas guardadas en este móvil.
- Botones idénticos (mismos `data-act` y condición de anfitrión). `aria-label="Mission Report"`, `.result`,
  `.result-hero`, `.result-me`, `.stats`, `.timeline`, `.roster`, `.highlights` se mantienen (los usan game.css,
  `sim/grabacion/grabar-demo.mjs` y los tests).
- Estilos nuevos en `mobile/www/css/report.css` (prefijo `.mr-` o sobre `.result.mr`), con tokens de
  `tokens.generated.css`; texto sobre `--surface/--surface-2` con `--text`, `--muted`, `--brand`, `--runner`
  (≥ 4,5:1); las barras son decorativas (`aria-hidden`), la cifra va siempre en texto. Movimiento solo con
  `prefers-reduced-motion: no-preference`.
- **Compartir**: `reportShareText` sin cambios de formato (modo, ganador, motivo, cifras, momentos). Sin coordenadas,
  sin código de sala, sin identificadores, sin lo personal ni el historial (test de privacidad). Los nombres sí van:
  son los que ve toda la sala y ya iban antes.

## 3. Estadísticas individuales: evaluación y decisión

Identificadores en el cliente: `outrun.session` (`playerId`+`secret`+código, cambia con cada sala),
`outrun.installId` (aleatorio por instalación, se envía al servidor para limitar dispositivos) y `outrun.name`.
Ninguno es una cuenta: no hay identidad persistente entre móviles.

| Alternativa | Qué exige | Coste / riesgo |
|---|---|---|
| **A. Solo local (localStorage)** | Un módulo puro en el cliente | Mínimo; sin datos personales fuera del móvil; se pierde al borrar datos o cambiar de móvil |
| B. Servidor por `installId` | BD (hoy solo hay `STATE_FILE`), escritura al terminar, retención y borrado | Medio; `installId` pasa a ser identificador personal persistente → aviso de privacidad, borrado a petición; Render sin disco persistente gratuito |
| C. Cuentas | Registro, autenticación, BD, RGPD completo | Alto; fuera del alcance del proyecto ahora |

**Decisión: A** (la recomendación del arquitecto). `mobile/www/js/stats.js`:
- `recordGame(storage, snap, myId)` → `{ recorded, stats }`: idempotente con una huella FNV-1a de
  `roomId|gameNo|finishedAt` (no se guarda el identificador; recargar o reconectar no cuenta dos veces; la revancha
  sí cuenta). Guarda como mucho 200 huellas.
- `readStats(storage)`; `gameStats(snap, myId)`; `emptyStats()`; clave `outrun.stats` (versión 1).
- Cuenta: partidas, victorias, derrotas, «sin ganador o fuera», capturas hechas, veces capturado, tiempo libre total
  y mejor supervivencia (solo si es seguro: hasta la captura o hasta el final sin haber abandonado), y partidas /
  victorias por modo. Resultado según `personalResult` (mismo criterio que «Tu partida»).
- Nunca lanza: sin `localStorage`, bloqueado, lleno o con JSON dañado → historial vacío y no guarda.
- No guarda nombres, códigos, ids de jugador ni nada de ubicación (test).
- Limitación documentada en la propia pantalla: «Se guarda solo en este móvil… Se pierde al borrar los datos de la
  app o al cambiar de móvil».

## 4. Archivos

- `mobile/www/js/game-view.js` (solo la zona del informe): `missionReport` ampliado (campos nuevos `modeId`,
  `winnerTeam`, `causeId`, `totalMs`, `firstCaptureMs`, `decisive`, `survival`, `survivors`, `moments`; los
  anteriores no cambian salvo el defecto 1); nuevos `totalDuration`, `reportSurvival` y `reportMoments` (interno).
- Nuevos: `mobile/www/js/report-view.js` (`missionReportScreen`), `mobile/www/js/stats.js`,
  `mobile/www/css/report.css`, `mobile/test/report-view.test.mjs`, `mobile/test/stats.test.mjs`.
- QA: `jugar-partidas.mjs` (partidas reales contra servidor propio), `instantaneas/*.json`, `preview.html`,
  `capturar.mjs`, `capturas/*.png`.

## 5. Pruebas y resultados reales

- `npm test --prefix mobile`: **207/207** en la última ejecución (en una anterior fallaba 1 test ajeno de `gps-check.test.mjs`, defecto 7, que otro agente ya ha corregido).
  Nuevos: report-view 10/10, stats 7/7. Los de informe existentes (report, modes, regresiones-ciclo,
  result-and-ping) pasan sin cambios.
- `node --test server/test/report.test.mjs server/test/reconnect.test.mjs`: 7/7. No se ha tocado el motor (no
  hacía falta `npm test` raíz).
- Partidas reales contra `PORT=8823 MAX_ROOMS_PER_IP=20 node server/main.ts` con clientes `net.js`
  (`jugar-partidas.mjs`): clásico todos capturados, clásico terminado por el anfitrión, infección todos infectados,
  zorro atrapado, zorro que abandona, clásico por tiempo e infección por tiempo (10 min reales) → **7/7** con el
  mismo informe para todos los jugadores y tras reconectar con la sesión guardada. Servidor propio detenido al acabar.
- Chrome headless (Playwright, `capturar.mjs`) a 360 y 412 px: 0 errores de consola y 0 px de desbordamiento
  horizontal en todas las capturas de `capturas/`.

## 6. Integración en app.js (para el arquitecto)

1. `index.html`: tras `css/game.css`, añadir `<link rel="stylesheet" href="css/report.css">` (y en la lista de
   caché de la PWA si la hay).
2. `app.js` imports: `import { missionReportScreen } from './report-view.js';` e
   `import { readStats, recordGame } from './stats.js';`
3. Sustituir el cuerpo de `finishedScreen(snap)` por:
   ```js
   function finishedScreen(snap) {
     return missionReportScreen(snap, { myId: ui.conn.playerId, nameOf, stats: readStats(store) });
   }
   ```
   y borrar `rosterHtml` (ya no se usa). Los `data-act` (`rematch`, `share-report`, `leave`) siguen igual; el
   manejador `share-report` no cambia.
4. Registrar la partida al recibir una instantánea FINISHED (donde se procesa cada snapshot, p. ej. junto a
   `showConversion(snap)`):
   ```js
   if (snap.phase === 'FINISHED' && ui.conn?.playerId) recordGame(store, snap, ui.conn.playerId);
   ```
   Es idempotente: puede llamarse con cada instantánea; `store` ya es tolerante a `localStorage` ausente.
5. Imports de game-view.js que dejarían de usarse en app.js: `personalResult`, `reportParticipants` (y `clock`
   si no se usa en otro sitio; sí se usa). `missionReport` y `reportShareText` siguen para compartir.

## 7. Pendientes y limitaciones

- Defecto 6 (el informe se pierde con la revancha o el cierre): opción barata, guardar en memoria de app.js la
  última instantánea FINISHED y ofrecer «Ver el informe anterior» en la sala; requiere app.js.
- Defecto 5 (palabra «captura» en Infección): decidir y actualizar `modes.test.mjs`.
- Historial solo local: se pierde al borrar datos o cambiar de móvil; no hay ranking entre jugadores.
- No hay hora de salida de quien abandona en la instantánea: su supervivencia no se muestra (correcto, no se inventa).
- `time_up` con ganador `hunter` no existe en el motor actual; si cambiara, el informe lo mostraría igual.
