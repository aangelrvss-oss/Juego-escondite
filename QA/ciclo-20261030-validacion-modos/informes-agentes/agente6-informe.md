# Agente 6 · Revisión independiente y adversarial (solo lectura)

Repositorio: `C:\Users\aange\Projects\Juego-escondite-recuperacion` (rama mapa-real, trabajo sin commit).
No se ha ejecutado nada. Los scripts de esta carpeta reproducen cada fallo y dicen qué imprimen si existe.

## Hallazgos

| Id | Modo | Sev. | Confianza | Script |
|---|---|---|---|---|
| A6-1 | Todos (crítico en Zorro) | P1 | Confirmado leyendo | a6-01-fugitivo-sin-gps.ts |
| A6-2 | Todos (crítico en Zorro) | P2 (P1 en Zorro) | Confirmado leyendo | a6-02-oraculo-de-proximidad.ts |
| A6-3 | Todos | P2 | Confirmado leyendo | a6-03-abandono-bloquea-revancha.ts |
| A6-5 | Todos | P2 | Confirmado leyendo | a6-05-vida-maxima-borra-resultado.ts |
| A6-6 | Todos (servidor) | P2 | Confirmado leyendo | a6-06-fallos-ajenos-bloquean-ubicacion.ts |
| A6-4 | Todos | P3 | Confirmado leyendo | a6-04-fantasma-en-informe.ts |
| A6-7 | Zorro / Infección (Clásico, silencioso) | P3 | Confirmado leyendo | a6-07-asignaciones-invisibles-tras-traspaso.ts |
| A6-8 | Infección | P3 | Confirmado leyendo | a6-08-infeccion-cazadores-no-exactos.ts |
| A6-9 | Todos (servidor) | P3 | Probable | a6-09-reenvio-de-pistas-al-expulsado.ts |
| A6-10 | Infección (cliente) | P3 | Confirmado leyendo | a6-10-menores.ts |
| A6-11 | Todos | P3 | Confirmado leyendo | a6-10-menores.ts |
| A6-12 | Clásico / Infección (doc) | P3 | Confirmado leyendo | a6-10-menores.ts |
| A6-13 | Todos | P3 | Confirmado leyendo | a6-10-menores.ts |
| A6-14 | Servidor | P3 | Sospecha | — |

### A6-1 · Un fugitivo sin GPS es invisible, no se le puede capturar y nunca queda «sin conexión» (P1)
- Evidencia: la presencia (D-057) cuenta cualquier mensaje de la app (`server/hub.ts:410-412`, `seen()` 657-665; el cliente hace ping cada 10 s, `net.js:14,284-302`). La reclamación exige lectura del fugitivo de ≤ 15 s (`engine.ts:837`), la zona solo se evalúa al llegar una lectura (`engine.ts:677`, `evaluateZone` 511) y la pista lo da como `UNAVAILABLE` (`engine.ts:332-340`).
- Secuencia: el fugitivo retira el permiso de ubicación o apaga la ubicación del sistema con la app abierta (o se mete en un interior sin GPS). Sigue `active`, nunca `away`, nunca fuera por el periodo de gracia, puede salir de la zona sin exposición, cualquier reclamación da `target_location_stale` aunque el cazador lo toque; solo cae si se autodeclara. Al final, `time_up` → ganan los fugitivos. En la Caza del zorro decide la partida.
- Nada en el servidor lo limita (la alerta `locationDenied` es solo del cliente, `app.js:858`).
- Script: imprime `target_location_stale`, `away: false`, `UNAVAILABLE`, `{"winner":"runner","cause":"time_up"}`.

### A6-2 · «Reclamar captura» es un escáner ilimitado y silencioso (P2; P1 en Zorro)
- Evidencia: la interfaz lista como objetivo a todo rival activo (`game-view.js:415-419`, `app.js:957-958`); el único límite es 1 reclamación cada 3 s por cazador (`hub.ts:83,549`); los errores distinguen `not_close_enough` / `target_location_stale` / `accuracy_too_low` / `target_location_unstable` (`engine.ts:836-850`) y el fugitivo no recibe nada si falla (solo `tag_claimed` al acertar, `engine.ts:861`).
- Contradice §8.1 [PROPIETARIO]: «el escáner es limitado y no revela más información de la necesaria». Con n−1 cazadores contra un zorro conocido, son ~20 sondeos/min por cazador de «¿está a ≤ 21–40 m?» y «¿tiene GPS?».
- Script: barrido cada 40 m: `not_close_enough` ×4, luego `RECLAMACIÓN CREADA`; r1 solo recibe 1 aviso; sondeo a r2 → `target_location_stale`.

### A6-3 · Quien abandona la partida no puede volver a la revancha (P2)
- Evidencia: «Abandonar la partida» envía un solo `leave` y el cliente olvida la sesión (`app.js:1369-1385`). En HEAD_START/ACTIVE eso deja `status=left, leftRoom=false` (`engine.ts:872-879`, `removePlayer` 909). `rematch` lo invita (`engine.ts:950-971`). Al volver a entrar con el código, `join` encuentra su `deviceId` en un jugador `invited` → `already_joined` (`engine.ts:756-757`). Si el anfitrión expulsa la fila «Invitado» fantasma, su dispositivo queda vetado (`kick`, `engine.ts:638-643` → `not_found`).
- Mismo origen: el abandono en la cuenta atrás (`leftRoom` falso fuera de LOBBY/FINISHED).
- Script: `left leftRoom = false` → `invited` → `already_joined` → `not_found`.

### A6-5 · Una partida que cruza las 6 h de vida de la sala pierde el resultado (P2)
- Evidencia: `lifetime` solo está en LOBBY y FINISHED (`engine.ts:184-213`). Al terminar una partida empezada antes de las 6 h, el mismo `runDue` procesa `game_end` y después `lifetime` → `close('expired')`; el hub borra la sala 60 s después (`hub.ts:731-734`). El cliente pinta «La sala se ha cerrado» en lugar del Mission Report. Nada impide empezar a las 5 h 59 min.
- Script: `fase: CANCELLED | closeReason: expired | ... game_finished, room_closed`.

### A6-6 · Los fallos de otros bloquean las lecturas autenticadas por HTTP (P2)
- Evidencia: `uploadLocation` comprueba `tooManyFailures(ip)` antes de autenticar (`hub.ts:613-615`); los códigos de sala incorrectos cuentan como fallo por dirección (`join` → `fail`, `hub.ts:480`) y bastan 20/min (`RATE.failuresPerMinutePerIp`). Cualquiera que comparta dirección (misma Wi-Fi en el punto de encuentro, CGNAT del operador, o el túnel sin `TRUST_PROXY=1`) deja a todos sin envío nativo con la pantalla bloqueada (429), sin sesión ni sala. Tras un reinicio sin `STATE_FILE`, los 401 de los servicios nativos de un grupo también lo disparan.
- Script: `antes: gone` → `después: rate_limited` → `59 s después: rate_limited`.

### A6-4 · Participante fantasma en el Mission Report tras una cuenta atrás abortada (P3)
- Evidencia: `backToLobby` solo limpia a los `active` (`engine.ts:412-425`); quien salió conserva `team` y `playedGameNo`, y `gameNo` no cambia. La vista de FINISHED incluye a los `left` con `playedGameNo === gameNo` (`view.ts:186`) y `reportParticipants` lo pinta como «Abandonó» con equipo (`game-view.js:271-298`); además, se le invita a la revancha.
- Script: el informe lista `a:Alba:hunter:left` y `a2:Alba:hunter:active`; el fantasma queda `invited`.

### A6-7 · Asignaciones manuales invisibles tras un traspaso de anfitrión (P3)
- Evidencia: `teamPref` solo lo ve `teamPrefSetBy` (`view.ts:192`); el traspaso no lo cambia (`engine.ts:395-410`). El nuevo anfitrión ve «Sorteo» (`app.js:756`), no puede «volver» a Sorteo sin elegir otra opción antes y recibe `teams_unbalanced` «revisa los roles asignados a mano» sin ver la causa. En Clásico, se aplican roles fijados por alguien que ya no está.
- Script: `b=oculto ... c=runner` → `teams_unbalanced`, `fox_hunt`.

### A6-8 · Infección: los cazadores «exactos» dejan de serlo si alguien sale en la cuenta atrás (P3)
- `leave` en COUNTDOWN solo comprueba equipos vacíos y el mínimo (`engine.ts:889-893`). Con 8 → 7 quedan 2 cazadores donde la regla da 1. Decidir si `n` es el de inicio (documentarlo) o volver a la sala.

### A6-9 · El expulsado por el periodo de gracia recibe al reanudar las pistas con coordenadas (P3, probable)
- `resume` reenvía el buzón (`hub.ts:504-509`) y las entradas con coordenadas solo se purgan al terminar (`hub.ts:719-730`). Las pistas emitidas mientras estaba «sin conexión» pero activo le llegan ya fuera de la partida. La prueba `server/test/presence.test.mjs:137` solo mira `snapshot.lastPing`.

### A6-10 · Infección: el convertido sigue viendo a sus antiguos compañeros hasta 5 s, pintados como «Tu equipo» (P3)
- `role_changed` no limpia `ui.positions` (`app.js:278-286`), el servidor no reenvía posiciones al convertir (solo cada 5 s, `hub.ts:783-805`) y `mapModel` colorea `teammate` con el equipo actual (`game-view.js:448-451`). §11.2 dice «al instante».

### A6-11 · La sala de espera no caduca si algún móvil reconecta (P3)
- `connection` cuenta como actividad (`engine.ts:556-559` solo excluye `seen`). Una pestaña olvidada que reconecta mantiene la sala hasta las 6 h. `engine/test/presence.test.ts:52` solo prueba `seen`.

### A6-12 · «Roles ocultos hasta el final» no se cumple en la práctica (P3, documento)
- Cada jugador ve el equipo de sus compañeros y `null` en los demás (`view.ts:149-158`); por complemento sabe el de todos. Además `runner_captured` y `captures` dan el `hunterId` a todos. La tabla §11.4 promete otra cosa; la tarjeta del rol («Solo lo ves tú») también confunde.

### A6-13 · Ignorar una reclamación no deja rastro (P3)
- Solo el rechazo explícito suma para `repeated_tag_rejections` (`engine.ts:696-699`); la caducidad no (`engine.ts:276-284`). Dejar pasar 30 s es un rechazo gratis e invisible. D-035 (disputa que «queda pendiente») tampoco está implementada: el rechazo cierra la reclamación.

### A6-14 · Reloj de pared del servidor no monótono (P3, sospecha)
- El hub usa `Date.now()` como hora autoritativa. Si el reloj del portátil retrocede (sincronización), el motor recibe un `now` menor: no vence nada y `recordSample` descarta todas las lecturas (`location.ts:83`) hasta recuperar la hora, así que todas las reclamaciones fallan por lectura antigua. Un salto adelante de más de 60 s se toma por una suspensión y perdona ausencias (`hub.ts:837-841`).

## Ganchos del simulador
`routes` (`main.ts:234`), `rateNow` (`hub.ts:199`, por defecto `now`) y `keepAliveConnected` (solo lo llaman las pruebas y el simulador) no cambian nada en producción si no se usan; `simulacion.test.mjs:185` lo comprueba para las rutas. Matiz: `checkSuspended` usa siempre `Date.now()` real, no el reloj inyectable. Con el simulador en pausa más de 60 s reales, al reanudar se perdona la ausencia de todos (se pierde el escenario de pestaña congelada), y ninguna prueba cubre `forgiveAbsence`.

## Riesgos no cubiertos por pruebas
- Fugitivo sin GPS con la app abierta (A6-1); reclamaciones como sondeo (A6-2).
- Abandono → revancha → volver a entrar con el mismo móvil (A6-3); cuenta atrás abortada y la partida siguiente (A6-4).
- Sala de más de 6 h que termina una partida (A6-5).
- Bloqueo por dirección en `/api/loc` (A6-6); reinicio sin `STATE_FILE` con servicios nativos activos.
- Suspensión del servidor (`forgiveAbsence`, `server_was_suspended`): ninguna prueba.
- Eventos reenviados a un expulsado por el periodo de gracia (A6-9).
- Traspaso de anfitrión con asignaciones manuales hechas (A6-7).
- Reloj del servidor hacia atrás (A6-14).

## Pruebas débiles o frágiles
- `server/test/helpers.mjs:30-38` (`advance`) llama a `hub.keepAliveConnected()` cada 20 s: las pruebas de presencia por servidor dan por hecho que el cliente envía señales; no comprueban que `net.js` lo haga.
- `server/test/presence.test.mjs:176` «un cliente no puede enviar señales de vida falsas» solo prueba que `cmd seen` está prohibido; cualquier `{t:'ping'}` mantiene la presencia (A6-1). El título promete más de lo que verifica.
- `server/test/presence.test.mjs:137-162` comprueba `snapshot.lastPing === null` pero no los eventos `ping` reenviados (A6-9).
- `server/test/capture-race.test.mjs:29-33` y `presence.test.mjs:186-188`: `settle()` fijo de 30 ms entre lecturas enviadas por otros sockets y la reclamación. En una máquina lenta puede dar `target_location_stale` (inestable).
- `server/test/presence.test.mjs:114`: `settle(1_500)` depende del retardo de reintento (500 ms + aleatorio).
- `sim/panel/test/simulacion.test.mjs:73`: la aserción del periodo de gracia va dentro de `if (phase === 'ACTIVE')` y puede pasar sin comprobar nada; `:43-47` acepta cualquier resultado; `:127` comprueba `canTagFrom − convertedAt` (detalle interno) en vez de que una reclamación se rechace.
- `mobile/e2e/conexion.e2e.mjs:176` (`sleep(5_000)`) y `zorro.e2e.mjs:117` (`sleep(2_000)`): esperas fijas.
- `engine/test/presence.test.ts:52` solo prueba `seen` (A6-11 pasa sin detectar).

## Casos que pueden romper una partida real en la calle
1. Un fugitivo entra en un portal, un parking o el metro: pierde el GPS pero no los datos, y queda intocable e invisible (A6-1). En la Caza del zorro, con el zorro, la partida acaba en «gana el zorro».
2. Un jugador pulsa «Abandonar», se arrepiente y quiere la revancha: «Este móvil ya está en la sala» (A6-3).
3. Todos en la misma Wi-Fi o detrás del mismo operador: unos cuantos códigos mal escritos dejan sin envío con pantalla bloqueada a todo el grupo durante un minuto (A6-6).
4. Una tarde larga con la misma sala: la partida que cruza las 6 h termina sin informe (A6-5).
5. Un cazador que pulsa nombres sin parar en el mapa obtiene un detector de «caliente/frío» (A6-2).
6. El anfitrión se va de la sala tras asignar el zorro: el nuevo no puede empezar y no ve por qué (A6-7).

## Recomendación provisional por modo
- **Clásico:** apto para validación física con un grupo de confianza. Antes, avisar de A6-1 y A6-2 (dependen de la honradez) y evitar «Abandonar» si se quiere revancha (A6-3).
- **Infección:** apto para validación física con las mismas advertencias. A6-8 y A6-10 son menores.
- **Caza del zorro:** apto solo como prueba de funcionamiento, no de equilibrio. A6-1 y A6-2 son decisivos con un único objetivo conocido por n−1 cazadores. Conviene acotar el sondeo y dar un tratamiento al fugitivo sin GPS (p. ej., exponerlo o retirarlo) antes de sacar conclusiones de equilibrio.
