# Agente 2: servidor y protocolo. Correcciones C4 a C8

Las salidas reales están en `correcciones/antes/` y `correcciones/despues/`, dentro del scratchpad.

## C4 · V-07: los fallos de otros por dirección IP bloqueaban `/api/loc`
- **Causa.** `uploadLocation` comprobaba `tooManyFailures(ip)` antes de autenticar la sesión. Por eso 20 códigos falsos desde la misma IP dejaban sin ubicación a todo el grupo.
- **Cambio** (`server/hub.ts:644-660`). Primero se autentica la sesión. El límite por IP solo se aplica cuando la sesión no es válida, y esos intentos siguen contando como fallo.
  - La protección contra fuerza bruta se mantiene: con la IP bloqueada, una sesión inválida sigue recibiendo 429.
  - Ahora se distingue si una sesión es válida aunque la IP esté bloqueada. Con un secreto de 32 bytes aleatorios, adivinarlo sigue siendo inviable.
- **Prueba.** `server/test/regresiones-ciclo.test.mjs`, bloque C4. Comprueba 20 códigos falsos más una sesión válida en la sala de espera (`gone`), sesiones inválidas con respuesta `rate_limited` y otra IP con `bad_session`. Además, en los tres modos, una lectura válida en partida es `accepted` con la IP bloqueada.
- **Antes** (`a6-06`): `antes: gone / después: rate_limited / 59 s después: rate_limited`. La prueba nueva fallaba: `actual 'rate_limited'`, se esperaba `'gone'` o `'accepted'`.
- **Después:** `antes: gone / después: gone / 59 s después: gone`. La prueba pasa.
- **Modos:** los tres por igual, porque es transporte.

## C5 · V-16: comandos pendientes al perder la sesión (net.js)
- **Causa.** Con `bad_session`, `removed` o el cierre 4000 no se vaciaba `this.pending`. El siguiente `welcome`, ya de otra sala, reenviaba esos comandos.
- **Cambio en `mobile/www/js/net.js`.**
  - Nuevo `#dropPending(error)` (`:270-279`): resuelve cada promesa con `{ok:false,error}` y vacía la lista.
  - Se llama al recibir `bad_session` o `removed` (`:400`) y en el cierre 4000 con `room_closed` (`:241`).
  - `#failPending` lo reutiliza (`:264-267`).
- **Cambio complementario en `server/hub.ts:543-560, 764`.** Hacía falta para no romper el `leave` propio.
  - Antes, el servidor enviaba `removed` antes del `result` del mismo comando, y el `leave` habría resuelto con error.
  - Ahora `command()` retiene los avisos `removed` hasta haber enviado el resultado. La sesión se invalida igual de inmediato; solo cambia el orden de los dos mensajes.
  - Es compatible con clientes antiguos.
- **Prueba.** `mobile/test/net-regresiones.test.mjs`:
  - Con WebSocket falso: `removed` y cierre 4000 (la promesa se resuelve con error y el comando no se reenvía en la sala nueva), y una reanudación normal que sí reenvía.
  - Con servidor real: el escenario A2-2 con `bad_session`, y un `leave` en la sala de espera que sigue devolviendo `{ok:true}`, con el resultado antes que `removed`.
- **Antes** (`net.js` sin el cambio): 3 de 4 fallaban con `actual: 'colgada'`. `a2-2` pasaba, lo que confirmaba el fallo.
- **Después:** 5 de 5 pasan. `a2-2` falla en «FALLO: el comando de la sala borrada sigue pendiente», es decir, el fallo ha desaparecido.
- **Modos:** los tres (cliente de red).

## C6 · V-17: presencia adelantada hasta 5 s
- **Causa.** `seen()` descartaba la hora de las señales que llegaban dentro de los 5 s de `SEEN_EVERY_MS`.
- **Cambio** (`server/hub.ts:689-717`). La frecuencia con la que se avisa al motor sigue limitada. Para las señales intermedias:
  1. Primero vencen los plazos ya cumplidos (`checkSuspended` y `tick`), como haría el motor.
  2. Después se anota `lastSeenAt = now`, que equivale a `markSeen` para un jugador que no está «sin conexión»: no genera eventos ni cambia nada más.
  3. Si al vencer los plazos el jugador acaba de pasar a «sin conexión», la señal pasa por el motor y vuelve al momento.
- Los plazos de 30 s y 5 min no cambian.
- **Prueba** (bloque C6, en los tres modos). Dos señales separadas 4,9 s:
  - a los 30 s de la primera, no está «sin conexión»; a los 30 s de la última, sí;
  - a los 5 min de la primera sigue `active`; a los 5 min de la última pasa a `left/timeout`.
  - Otra prueba: pings reales cada 10 s sin `keepAliveConnected` nunca dan «sin conexión»; con 31 s de silencio, sí.
- **Antes:** «sin conexión antes de 30 s desde la última señal», `actual true`, en los tres modos.
- **Después:** pasa. `a2-3` falla en «FALLO: el motor no conoce la última señal», es decir, el fallo ha desaparecido.

## C7 · V-18: `cmd` nulo o ausente
- **Causa.** `protocol.ts` acepta cualquier valor en `cmd`, y `Hub.run` leía `cmd.type`, lo que lanzaba `TypeError` y cerraba la conexión con 1011.
- **Cambio** (`server/hub.ts:571-575`). Si `cmd` no es un objeto (null, ausente, número, texto o lista), se responde `result {ok:false, error:'invalid_command', detail:'cmd'}` y la conexión sigue abierta.
- `protocol.ts` no se toca: si lo rechazara ahí, la respuesta sería `bad_message`, sin `id`, y la promesa del cliente quedaría colgada.
- **Prueba** (bloque C7): cinco formas inválidas responden `invalid_command`, la conexión no se cierra y un comando válido posterior funciona.
- **Antes:** `TypeError: Cannot read properties of null (reading 'type')`.
- **Después:** pasa. `a2-4` falla en «FALLO: la conexión se cierra»: ya no se cierra.
- **Modos:** no depende del modo.

## C8 · V-19: pistas con coordenadas a quien quedó fuera
- **Causa.** El buzón de reanudación solo se purgaba al llegar a FINISHED o CANCELLED.
- **Cambio** (`server/hub.ts:76-84, 735, 768-776, 784`).
  - Nueva función `purgeLocations()`, que también usa la purga del final de partida.
  - En `commit`, cuando un jugador pasa a `left` en ese paso, se quitan las coordenadas de sus eventos guardados. El evento se mantiene como `{purged:true}` para no dejar huecos de `seq`.
  - No cambia lo que recibe un jugador activo ni un capturado.
- **Prueba** (bloque C8, en los tres modos, con 8 jugadores):
  - el cazador que queda fuera reanuda y recibe la pista sin coordenadas, sin ninguna `"position":{` en lo reenviado;
  - otro cazador activo recibió la pista en directo con coordenadas y, al reanudar, la sigue recibiendo con ellas.
- **Antes:** `a6-09` daba `Beto: left timeout | pistas reenviadas: 1 | con coordenadas: true`, y la prueba fallaba en los tres modos (`1 !== 0`).
- **Después:** `con coordenadas: false` y la prueba pasa.

## C2-hub
No ha llegado ningún mensaje del agente del motor, así que no se ha aplicado nada.

## Archivos modificados
- `server/hub.ts`
- `mobile/www/js/net.js`
- Nuevos: `server/test/regresiones-ciclo.test.mjs` y `mobile/test/net-regresiones.test.mjs`
- Sin cambios: `protocol.ts`, `ws.ts`, `main.ts`.

## Pruebas ejecutadas (después, una a una, con `--test-concurrency=1`)
| Archivo | Resultado |
|---|---|
| `server/test/regresiones-ciclo` | 12/12 |
| `server/test/presence` | 7/7 |
| `server/test/multiplayer` | 2/2 |
| `server/test/capture-flow` | 7/7 |
| `server/test/capture-race` | 5/5 |
| `server/test/diagnostics` | 4/4 |
| `server/test/fox-hunt` | 2/2 |
| `server/test/infection` | 3/3 |
| `server/test/sim-hooks` | 3/3 |
| `server/test/hostile` | 9/9 |
| `server/test/reconnect` | 6/6 |
| `server/test/leave` | 4/4 |
| `server/test/keepalive` | 2/2 |
| `server/test/persistence` | 7/7 |
| `server/test/upload` | **5/6** (ver abajo) |
| `mobile/test/net-regresiones` | 5/5 |
| `mobile/test/game` | 15/15 |
| `mobile/test/replay` | 3/3 |
| `mobile/test/lockscreen` | 6/6 |

`tsc -p tsconfig.json --noEmit` termina sin errores.

### Prueba existente que deja de pasar por un cambio legítimo
`server/test/upload.test.mjs:87`, «sesión falsa o secreto ajeno… 429»: comprueba `upload(reading(ana)) === 429` con «incluso con la sesión buena: la dirección está bloqueada un minuto». Eso es justo el fallo V-07.
- C4 / PLAN_DE_CORRECCIONES pide: «20 fallos desde la misma IP y una sesión válida que sigue recibiendo 200». Ahora recibe 202, porque está en la cuenta atrás.
- No se ha modificado. Quien tenga la propiedad de la prueba debe cambiar la línea 87 a `202` (sesión válida) y, si quiere, comprobar que una sesión inválida recibe 429.
- La línea 89 (204 pasado el minuto) sigue siendo válida.

## Pendientes y notas
- Las reproducciones `a2-2`, `a2-3` y `a2-4` ahora fallan: están escritas para pasar mientras el fallo exista.
- Los clientes que reanudan tras quedar fuera reciben un evento `ping` con `{purged:true}`. `app.js` ya lo trata así tras FINISHED: como evento repetido no avisa, y `ui.ping` queda vacío.
- En C6 se anota `lastSeenAt` directamente en `room.state`, como ya hace `forgiveAbsence`, en lugar de pasarlo por el motor en cada señal.
