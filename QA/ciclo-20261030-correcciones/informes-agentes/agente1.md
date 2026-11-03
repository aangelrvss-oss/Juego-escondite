# Agente 1 · Motor y reglas · correcciones autorizadas (30/10/2026)

Ninguna regla aprobada cambia. No he hecho ninguna operación de git que escriba. No he tocado server/, mobile/, sim/ ni docs/.

## Archivos modificados
- `engine/src/engine.ts`: C10 (l. 311-323), C1 (l. 429-437), C19b (l. 489-494), C9 (l. 577-579), C2 (l. 777-811), C3 (l. 819-823).
- `engine/src/types.ts`: `ErrorCode` + `'room_expiring'` (l. 236-237).
- `engine/src/view.ts`: C19a (l. 208-210).
- `engine/test/regresiones-ciclo.test.ts` (nueva): 23 pruebas.
- `engine/test/timing.test.ts` (l. 34-39): ajuste justificado en C10.

## C1 · V-04 · Quien sale en una cuenta atrás que se aborta
- **Causa.** `backToLobby` solo limpiaba a los jugadores `active`. Quien había salido seguía con `team`, con `playedGameNo = gameNo` y con `leftRoom=false`. Como `gameNo` no cambia, aparecía en el informe de la partida siguiente (`view.ts:186`) y lo invitaba `rematch` (`engine.ts:950`).
- **Cambio** (`engine.ts:429-437`). En `backToLobby`, a quien está `left` y `!leftRoom` con `playedGameNo === gameNo` se le aplica `team=null`, `playedGameNo=null` y `leftRoom=true`.
- **Por qué sale de la sala (`leftRoom=true`).** No llegó a jugar ninguna partida. Sin partida, salir equivale a salir de la sala, que es la misma regla que en LOBBY (`removePlayer`). Además, el cliente ya olvida la sesión al pulsar «Salir». El servidor le revoca la sesión con su lógica actual (`hub.ts` commit, `leftRoom`). Puede volver a entrar con el código como un jugador nuevo, porque `join` ignora los registros `leftRoom`.
- **Pruebas.** `C1 · V-04 … › classic | infection | fox_hunt: ni en el informe ni invitado a la revancha`: classic y zorro con 4 jugadores, Infección con 5. Cubre la salida que vacía un equipo y también la cancelación del anfitrión tras una salida.
- **ANTES**
  - `a6-04`: `a: left hunter jugó la partida 1` | informe `h | a:Alba:hunter:left:left | b | a2` | `fantasma en la revancha: invited`.
  - `a4-2`: `Grupo «Zorro»: [ 'f (Abandonó)', 'b (Escapó)' ]` → FALLO; `f en la revancha: invited`.
  - Prueba nueva: ✖ «sin el equipo del sorteo abortado».
- **DESPUÉS**
  - `a6-04`: `a: left null jugó la partida null` | informe `h | b | a2` | `fantasma en la revancha: left`.
  - `a4-2`: `[ 'b (Escapó)' ]` → «OK: un solo zorro en el informe»; `f en la revancha: left`.
  - Prueba nueva: ✔ en los 3 modos.
- **Modos.** Los tres.

## C2 · V-05 a/b · Volver a entrar con el mismo dispositivo
- **Causa.** `join` respondía `already_joined` si el mismo `deviceId` tenía cualquier registro que no estuviera fuera (`left`/`leftRoom`). Los dos casos afectados son:
  - un invitado a la revancha que había abandonado y cuyo móvil olvidó la sesión;
  - una plaza en LOBBY cuyo `welcome` se perdió.
- **Cambio** (`engine.ts:777-811`). Si el registro del mismo dispositivo está en `lobby` o `invited` y `connected === false`, se recupera la plaza:
  - se crea el jugador con el `actorId` nuevo, en `lobby`;
  - la plaza antigua pasa a `left` + `leftRoom=true`, y el hub ya revoca su sesión y envía `removed` a su conexión si queda alguna;
  - se heredan `teamPref`/`teamPrefSetBy`, y las referencias `teamPrefSetBy` se traducen;
  - si era el anfitrión, el anfitrión pasa al nuevo id (`host_changed`);
  - se emite `player_joined {playerId, name, replaces: <id antiguo>}`.
- **Casos en que no se recupera la plaza** (`already_joined` como antes):
  - un registro con la conexión abierta;
  - un registro `active` o `captured`: solo existen fuera de LOBBY, donde `join` da `game_in_progress`.
- **El veto se mantiene.** `blockedDevices` se comprueba antes, así que tras una expulsión sigue dando `not_found`.
- **Caso `left`.** Quien está `left` + `leftRoom` ya podía entrar como plaza nueva, y así sigue. Tras C1 no quedan registros `left` sin `leftRoom` en LOBBY: el revancha los pasa a `leftRoom` y C1 limpia los de la cuenta atrás.
- **Hub: no hace falta ningún cambio.** El hub ya asigna un `playerId` nuevo con secreto nuevo en cada `join` (`bind`). El `welcome` perdido se arregla con un reintento normal de `join`, y el hub revoca solo la sesión antigua (bucle `leftRoom` de `commit`).
- **Mejoras opcionales del hub** (no necesarias):
  1. borrar las entradas de `outboxes`, `replies`, `lastClaimAt`, `lastLocAt` y `lastSeenRunAt` del id retirado (ahora se liberan al borrar la sala);
  2. el `create` con `welcome` perdido (sala huérfana, A2-1) sigue sin resolverse y es cosa del hub.
- **Interfaz** (opcional): `player_joined.replaces` permite no avisar de «X ha entrado» como si fuera otra persona. Las instantáneas ya son correctas sin ese campo.
- **Seguridad: riesgo de suplantación.**
  - El cliente envía `installId`, pero el motor nunca lo expone: no aparece en `PlayerView` ni en los eventos, y `diagnostics.test` comprueba que no sale en el diagnóstico.
  - Para suplantar hay que conocer el `installId` de la víctima, guardado en su propio móvil.
  - Aun conociéndolo, solo se puede tomar una plaza:
    - en la sala de espera;
    - desconectada;
    - en `lobby` o `invited`.
  - Nunca se puede tomar la plaza de un jugador en partida ni saltarse una expulsión. Los límites del hub para `join` siguen aplicándose.
  - El riesgo previo ya existía: conociendo el `installId`, se podía bloquear a la víctima con `already_joined`.
- **Pruebas** (en `C2 · V-05 …`):
  - `a/b: tras «Abandonar» la partida, puede entrar en la revancha con el código y jugarla`;
  - `b: un welcome perdido en la sala de espera no deja fantasma…`;
  - `conserva la asignación del anfitrión y, si era el anfitrión, la sala sigue siendo suya`;
  - `seguridad: nunca toma la plaza de alguien conectado, ni de un jugador en partida, ni salta el veto`. Esta pasaba ya antes; protege los límites.
- **ANTES**
  - `a6-03`: `left leftRoom=false → invited → {"ok":false,"error":"already_joined"} → tras expulsar: not_found`.
  - Pruebas nuevas: ✖ `expected ok for join, got {"ok":false,"error":"already_joined"}`, tres veces.
- **DESPUÉS**
  - Variante de `a6-03` con el cierre de socket que hace el cliente real (`forget()` → hub `connection:false`), en `scratchpad/correcciones/a6-03-con-cierre.ts`: `invited → {"ok":true} → r2 antiguo: left leftRoom true | r2-nuevo: lobby`.
  - El script original, que no cierra el socket, sigue dando `already_joined`. Es lo esperado: es una plaza conectada.
  - Expulsar sigue dando `not_found`.
  - Pruebas nuevas: ✔ 4/4.
- **Modos.** Los tres (solo en la sala de espera).

## C3 · V-06 · Partida que cruza las 6 h
- **Causa.** El plazo `lifetime` solo existe en LOBBY y FINISHED. Una partida que termina pasadas las 6 h hace que `lifetime` venza en el mismo `runDue`, y la sala acaba `CANCELLED/expired`.
- **Cambio** (`engine.ts:819-823`; `types.ts:236-237`). `start` devuelve `room_expiring` si `now + cuenta atrás + ventaja + duración + periodo de revancha (30 min)` supera `createdAt + 6 h`. Así, la partida y su informe caben siempre durante todo el periodo de revancha.
  - Se comprueba después de `config_missing`/`safety_not_confirmed` y antes de las comprobaciones de jugadores.
  - He descartado la alternativa de no caducar con la partida viva porque alarga la vida de la sala más allá de las 6 h.
- **Pruebas.**
  - `C3 · V-06 … › classic | infection | fox_hunt: con 5 h 50 min, rechazo room_expiring; con 5 h, empieza y deja su informe`.
  - `límite exacto…`: exactamente en el límite empieza; 1 ms más tarde, no.
- **ANTES**
  - `a6-05`: `fase: CANCELLED | closeReason: expired | … game_finished, room_closed`.
  - Pruebas nuevas: ✖ 4.
- **DESPUÉS**
  - `a6-05`: `expected ok for start, got {"ok":false,"error":"room_expiring"}`. El script empieza a las 5 h 40 min con 30 min, y ahora se rechaza.
  - Pruebas nuevas: ✔ 4/4.
- **Interfaz.** El texto `room_expiring` ya está en `mobile/www/js/game-view.js:88`, y `mobile/test/game.test.mjs` exige texto para cada `ErrorCode`.
- **Modos.** Los tres.

## C9 · V-22 · `connection` contaba como actividad
- **Cambio** (`engine.ts:577-579`). `applyCommand` ya no actualiza `lastActivityAt` con `connection` (tampoco con `seen`, como antes).
- **Prueba.** `C9 · V-22 … con reconexiones cada 25 min y nada más, caduca a los 30 min de la última actividad`. `room_closed` se emite en `T0 + 30 min`.
- **ANTES**
  - `a6-10` (A6-11): `fase tras 3 h 20 min sin que nadie haga nada en la sala: LOBBY`.
  - Prueba nueva: ✖.
- **DESPUÉS**
  - `a6-10`: la sala ya está cerrada, y la reconexión del script recibe `room_closed`. El script se detiene en su `g.ok` (es lo esperado).
  - Prueba nueva: ✔.
- **Modos.** Ninguno en concreto (es la sala de espera).

## C10 · V-25 · Causa cuando todos quedan fuera a la vez
- **Causa.** Los plazos `absence_timeout` que vencían a la misma hora se procesaban uno a uno, por orden de id. El primero en salir terminaba la partida: `runners_abandoned` o `hunters_abandoned`, y el resto seguía «activo».
- **Cambio** (`engine.ts:311-323`).
  - Todos los que vencen en el mismo instante quedan fuera juntos: `removePlayer(…,'timeout')`.
  - Si el anfitrión estaba entre ellos, se traspasa una vez.
  - Después, `checkEnd` se ejecuta una sola vez.
  - Si no queda nadie en ningún equipo, el resultado es siempre `runners_abandoned`, `winner:null`. Es el orden que ya tiene `checkEnd` y no hay ganador en ningún caso. No se añade ninguna causa nueva.
- **Pruebas.** `C10 · V-25 … › classic | infection | fox_hunt: misma causa, sin ganador y todos fuera`, con ids `a,b,c` y `x,y,z`.
- **ANTES**
  - A1-5: runner `a` → `runners_abandoned`; runner `z` → `hunters_abandoned`.
  - Pruebas nuevas: ✖ 3 («h fuera»).
- **DESPUÉS**
  - A1-5: `a` → `runners_abandoned`; `z` → `runners_abandoned`.
  - Pruebas nuevas: ✔ 3/3.
- **Prueba existente ajustada.** `engine/test/timing.test.ts`, «un tick tardío procesa todos los plazos vencidos…».
  - Esperaba `'player_left', 'host_changed', 'game_finished'`, con el comentario «primero el anfitrión, por orden».
  - Eso es justo el resultado dependiente del orden de ids que corrige V-25.
  - Ahora espera `'player_left', 'player_left', 'game_finished'`, sin traspaso porque no queda nadie a quien pasarlo, y comprueba `outcome = {winner:null, cause:'runners_abandoned'}`.
- **Modos.** Los tres.

## C19 · V-27/V-28 · Infección
- **V-27** (`view.ts:208-210`). `canTagFrom` solo se entrega en HEAD_START/ACTIVE.
  - ANTES: ✖ «en FINISHED no». El último convertido recibía un `canTagFrom` futuro en el informe y en la sala de la revancha.
  - DESPUÉS: ✔.
- **V-28** (`engine.ts:489-494`). En `convert`, si el fugitivo estaba expuesto, se emite `runner_unexposed {runnerId}` a los cazadores activos y a él, antes de cambiarle el equipo. Es la misma audiencia que en `evaluateZone`.
  - ANTES: ✖ (0 eventos).
  - DESPUÉS: ✔ (1 evento).
- **Pruebas.** `C19 … › V-27: canTagFrom solo se entrega en la huida y la persecución` y `› V-28: convertir a un fugitivo expuesto avisa a los cazadores con runner_unexposed`.
- **Modos.** Infección. En Clásico y zorro la captura no convierte, así que no cambia nada.

## Verificación (punto 4) · reclamaciones al final
- Ya era correcto. `finish` vacía `claims`, la vista da `pendingClaimForMe`/`pendingClaimByMe` = null a todos, y `respond_tag` posterior da `claim_not_found` sin tocar el estado.
- He añadido la prueba: `Verificación (punto 4) … › {classic|infection|fox_hunt} · {end_game|time_up}` (6 casos, ✔ antes y después).

## Resultados reales (uno a uno, `node --test --test-concurrency=1`, memoria libre comprobada antes: 680-1060 MB)

| Archivo | Resultado |
|---|---|
| `regresiones-ciclo` | ANTES 7/23 (16 ✖) → DESPUÉS 23/23 |
| `transitions` | 37/37 |
| `presence` | 17/17 |
| `infection` | 19/19 |
| `fox-hunt` | 15/15 |
| `capture` | 22/22 |
| `timing` | 8/9 antes del ajuste justificado (C10) → 9/9 |
| `playtest-decisions` | 12/12 |
| `start` | 9/9 |
| `rules-version` | 2/2 |
| `visibility` | 10/10 |
| `briefing-lock` | 4/4 |
| `gps-jump` | 8/8 |
| `validation` | 9/9 |
| `zone` | 6/6 |

`npx tsc -p tsconfig.json` → exit 0, sin errores.

No he ejecutado pruebas de server, mobile ni sim, por la restricción.

## Avisos para otros agentes
- **Servidor.** Las pruebas de servidor que esperen alguna de estas cosas tendrían que revisarse:
  1. que una reconexión mantenga viva la sala de espera;
  2. la secuencia `player_left, host_changed` cuando todos quedan fuera a la vez;
  3. `already_joined` al reintentar desde el mismo `installId` desconectado.
- He buscado y no he encontrado ninguna, pero no las he ejecutado.
- La reproducción `a2-1-join-fantasma.test.mjs` debería ahora fallar en su aserción «FALLO» (el reintento entra), que es lo esperado.
- **Simulador.** Una partida por sala, como mucho 120 min: `room_expiring` no le afecta.

## Lo que no he podido corregir sin cambiar una regla
Nada.
