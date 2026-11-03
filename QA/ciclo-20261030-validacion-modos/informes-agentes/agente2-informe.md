# Informe del agente 2: servidor y multijugador (auditoría de solo lectura)

**Alcance leído:** `server/hub.ts`, `ws.ts`, `main.ts` y `protocol.ts`; `engine/src/engine.ts`, `view.ts`, `location.ts`, `modes.ts`, `validate.ts` y `constants.ts`; `mobile/www/js/net.js` y las partes de `app.js` que reaccionan a la red; el `UploadConfig`/`Uploader` de Android en lo que afecta a los códigos HTTP; `server/test/helpers.mjs` y la lista de pruebas de `server/test`. También las reglas: GAME_MODES_AND_RULES §11, D-057 y GAME_STATE_MACHINE §5 y §6.4.

**Lo que no se ha hecho:** no se ha ejecutado nada (ni pruebas, ni scripts, ni el servidor). Todo lo «confirmado» está confirmado leyendo el código, no ejecutándolo. Los scripts de reproducción de esta carpeta **no se han ejecutado**.

## 1. Mapa de eventos del protocolo

### Cliente → servidor
Todo viaja por WebSocket en JSON. `protocol.ts` comprueba la forma exacta: sin campos extra y con un máximo de 4 KB. Cualquier mensaje bien formado que llegue con sesión cuenta como señal de vida (`hub.ts:412`), con un límite de una cada 5 s, salvo que el jugador esté «sin conexión».

| Mensaje | Efecto | Validación |
|---|---|---|
| `create {name, installId}` | Sala nueva, `welcome` con secreto e instantánea | 10 intentos por minuto y conexión; fallos por IP; 5 salas por IP |
| `join {code, name, installId}` | Comando `join` del motor, luego `welcome` con secreto | Código incorrecto o dispositivo expulsado → `not_found`, que cuenta como fallo |
| `resume {playerId, secret, lastSeq}` | Cierra la conexión anterior con 4001; `welcome` sin secreto; reenvía los eventos guardados desde `lastSeq` (si siguen en la cola); instantánea; `connection:true` | Secreto comparado en tiempo constante sobre su hash |
| `cmd {id, cmd}` | Respuesta guardada por `id` (las 64 últimas por jugador); si no está, se aplica el comando en el motor y se responde con `result` | `join`, `connection`, `seen` y `location` → `forbidden`; `new_code` lo resuelve el servidor; `claim_tag`, como mucho uno cada 3 s; la forma, en `validate.ts`; los permisos de rol y fase, en `engine.ts` |
| `loc {lat, lng, acc, age, mock?}` | Lectura con `measuredAt = ahora del servidor − age` | Una cada 900 ms por jugador (compartida con HTTP); `0 ≤ age ≤ 10 min`; solo jugadores `active` en HEAD_START o ACTIVE |
| `ping {c}` | Responde `pong {c, s}` | — |
| HTTP `POST /api/loc` | Lo mismo que `loc`, con la sesión en el cuerpo | Origen, tipo de contenido y 1 KB; responde 204, 202, 410, 401 o 429; el servicio nativo se para con 401 y 410 |

### Servidor → cliente

| Mensaje | Quién lo recibe | Filtrado |
|---|---|---|
| `welcome` | La propia conexión | Lleva secreto solo al crear o entrar |
| `event {seq, type, at, data}` | Según `canReceive(audience)`, evaluado con el estado **posterior** al paso | `seq` contiguo por destinatario; se guarda en una cola de 300 eventos para reanudar; las coordenadas se purgan al llegar a FINISHED o CANCELLED |
| `snapshot {seq, snapshot}` | Cada destinatario de algún evento del paso, y quien reanuda | `snapshotFor`: equipo propio y de compañeros (en Fox, todos; en FINISHED, todos); `teamPref` solo para quien la fijó; `lastPing` solo para un cazador activo (y no la anterior a su conversión); reclamación pendiente propia; `canTagFrom` propio |
| `positions` | Cada 5 s en HEAD_START o ACTIVE; a quien está `active` o `captured` (también vacío) | `visiblePositions`: compañeros; fugitivos expuestos solo a cazadores en ACTIVE; en Fox, el zorro ve a los cazadores; el espectador ve a todos con 60 s de retraso |
| `result`, `code`, `pong`, `error` | La conexión | `removed`: se borra la sesión |

**Eventos del motor y su audiencia:**

| Audiencia | Eventos |
|---|---|
| ALL | `player_joined`, `player_left`, `player_kicked`, `player_connection`, `player_presence`, `player_updated{ready}`, `config_updated`, `countdown_started`, `countdown_aborted`, `head_start_started`, `hunt_started`, `runner_captured{runnerId, hunterId, via, atOffsetMs, converted?}`, `game_finished{outcome, captures, flags}`, `rematch_offered`, `host_changed`, `room_closed` |
| Uno o varios jugadores | `role_revealed` y `role_changed` (al interesado); `player_updated{teamPref}` (a quien la fija o al anfitrión); `tag_claimed` (al fugitivo); `tag_claim_resolved` (a cazador y fugitivo); `runner_exposed` y `runner_unexposed` (a los cazadores activos y al fugitivo); `zone_exit_warning`, `zone_reentered`, `start_zone_warning` y `start_zone_returned` (al interesado); `ping` (a los cazadores activos en ese instante, con posiciones) |
| Equipo `runner` | `ping_sent` |

Quien ha quedado fuera por el periodo de gracia (`left` con `timeout`, en la misma partida) solo recibe los eventos ALL.

## 2. Riesgos de concurrencia: lo comprobado

- **Serialización.** Node es de un solo hilo y cada mensaje se procesa entero, de forma síncrona: motor, distribución y respuesta. Antes de cualquier comando se ejecutan los plazos vencidos (`applyCommand` → `runDue`), así que **ningún comando se evalúa con plazos pendientes**. Correcto.
- **Dos cazadores sobre el mismo fugitivo.** Se crea la primera reclamación; la segunda recibe `already_pending` (`engine.ts:831`), y además cada cazador solo puede tener una pendiente. Hay prueba (`capture-race`).
- **Autodeclaración mientras le reclaman.** Se atribuye a quien reclamaba (`engine.ts:713-721`). Hay prueba.
- **Confirmación y caducidad en el mismo milisegundo.** Se procesa antes la caducidad: `claim_not_found`. **Confirmación o autodeclaración y final por tiempo en el mismo instante:** `game_end` tiene prioridad 0 y va antes, así que la reclamación se descarta y ganan los fugitivos. Cumple «el final por tiempo va antes».
- **Captura en el límite entre huida y persecución.** `claim_tag` y `self_tag` exigen ACTIVE. Si el comando llega a la hora exacta, `runDue` ya ha pasado a ACTIVE. Las lecturas de la huida siguen valiendo para la primera reclamación.
- **Infección: un convertido reclama antes de 60 s.** Recibe `tag_cooldown` (`engine.ts:826`). No se le atribuye una autodeclaración ajena (`725-726`). La pista que llega en el mismo paso no la recibe, porque la audiencia se calcula antes de la conversión, y la instantánea filtra con `pingsBeforeConversion`. Hay prueba de la espera.
- **Desconexión con una reclamación pendiente.** La reclamación sigue viva 30 s. Al volver, la instantánea trae `pendingClaimForMe` o `pendingClaimByMe`. A los 5 min, `removePlayer` la cancela con `tag_claim_resolved: cancelled`. Hay pruebas.
- **Reconexión durante la conversión.** `role_changed` queda en su cola; al reanudar se reenvía, o basta la instantánea (equipo `hunter` y `canTagFrom`). No hay prueba específica de reanudar justo después de convertirse.
- **Final con reclamaciones o avisos pendientes.** `finish` y `close` vacían las reclamaciones sin emitir `tag_claim_resolved`. El cliente se corrige con la instantánea (`app.js:186-189`). Hay prueba.
- **Mensaje duplicado.** Los comandos son idempotentes por `id`: la respuesta se guarda, también en el archivo de estado. `loc` no tiene id: un duplicado se descarta por los 900 ms o por no ser más reciente. `resume` duplicado no rompe nada. `create` y `join` **no son idempotentes** (ver A2-1).
- **Lectura atrasada.** Su antigüedad la mide el móvil al enviar y el servidor la convierte con su propio reloj, así que no hay hora de pared del teléfono. `recordSample` descarta la que no es más reciente que la última, venga por WebSocket o por HTTP. Para capturar, la antigüedad debe ser como mucho 15 s y la lectura no puede ser un salto (`engine.ts:836-842`). Los comandos no llevan hora del cliente: cuenta la del servidor al procesarlos. Limitación: no se descuenta la latencia de red (ver A2-6).
- **Pestaña duplicada.** `resume` cierra la anterior con 4001 tras quitarle el `playerId`, así que nadie ve una desconexión. `net.js` se queda en `replaced` y no reconecta en bucle. El cierre 4001 que llega a un socket antiguo de la misma pestaña se ignora (`this.socket !== socket`). Hay prueba.
- **Pestaña suspendida (socket abierto, sin mensajes).** El ping del servidor mantiene vivo el socket, pero los pong no cuentan (`ws.ts:159`). A los 30 s pasa a «sin conexión» y a los 5 min queda fuera. Es lo que manda D-057. Hay prueba (con `jump`).
- **Reinicio del servidor (STATE_FILE).** Todos quedan desconectados con `lastSeenAt = ahora` (el plazo empieza de cero). `seq` avanza 100 000 para que los clientes acepten la instantánea. Las respuestas se restauran. Se pierden como mucho 2 s. Hay pruebas. Sin STATE_FILE, las salas se pierden (está documentado).
- **Suspensión del servidor.** `checkSuspended` compara `Date.now()` con la última vuelta, en `run()` y en `pump()`. Solo perdona saltos de más de 60 s (ver A2-5). No tiene prueba en `server/test`, porque `Date.now` no se puede inyectar.
- **Snapshot tras reconectar.** Cada jugador tiene su propia cola de eventos ya filtrados al emitirse. Al reanudar llega `welcome`, después los eventos perdidos y por último `snapshotFor(viewer)`. No se ha encontrado ningún evento ni instantánea que dé a un cliente información de otro equipo que no pueda deducir ya (ver A2-10). La lista de jugadores no lleva el equipo de los rivales salvo en FINISHED y en Fox. El informe (`outcome`, `flags` y equipos) solo llega en FINISHED.

## 3. Hallazgos

### A2-1 · Si se pierde la respuesta de «join», queda un jugador fantasma y el dispositivo bloqueado
- **Modos:** todos (sala de espera).
- **Descripción:** si la conexión se corta o la página se recarga entre que el servidor procesa `join` y el móvil guarda el `welcome` con el secreto, el jugador queda creado (`status: lobby`, desconectado) y el móvil no tiene sesión.
  - Al reintentar desde el mismo dispositivo, `join` detecta el mismo `deviceId` y responde `already_joined`. No hay manera de recuperar esa sesión.
  - El fantasma (no listo y desconectado) impide `start` con `players_not_ready`.
  - La única salida del anfitrión es expulsarlo, y entonces el `installId` queda en `blockedDevices`: el jugador ya **no puede entrar nunca** en esa sala (`not_found`).
  - Con `create` pasa algo parecido: queda una sala huérfana que cuenta en el límite de 5 por IP y caduca a los 30 min.
- **Evidencia:** `engine.ts:754-757` (`already_joined` por `deviceId`), `engine.ts:643` (bloqueo al expulsar), `hub.ts:476-489` (sin idempotencia en create/join), `net.js:244-246` (`#failEntering('offline')`).
- **Reproducción:** `a2-1-join-fantasma.test.mjs`.
- **Clasificación:** lógica del servidor (protocolo de entrada no idempotente).
- **Severidad propuesta:** P1, porque impide jugar a esa persona en esa sala; ocurre poco, pero en redes móviles o al recargar es plausible.
- **Confianza:** confirmado leyendo.
- **Resultado esperado del script:** el reintento da `already_joined`; tras la expulsión, `not_found`.

### A2-2 · `net.js` reenvía en una sala nueva los comandos pendientes de una sesión perdida
- **Modos:** todos.
- **Descripción:** cuando se pierde la sesión (`bad_session` o `removed`, `net.js:383-390`), o la sala se cierra con 4000 (`net.js:237-242`), los comandos de `this.pending` no se descartan.
  - En el siguiente `welcome` de una sala **distinta** (`create` o `join`), `net.js:338` los reenvía con la sesión nueva.
  - Caso real: el jugador pulsa «Salir» sin cobertura, la sala se borra o el servidor se reinicia sin STATE_FILE, y el jugador vuelve a la pantalla de inicio.
  - Si crea una sala, el `leave` antiguo se aplica en ella: la sala se cierra «empty» y le llega `removed`.
  - Con `set_ready`, `configure`, `start` o `kick` antiguos, el comando se aplicaría en otra sala.
  - Además, la promesa de `await ui.conn.command({type:'leave'})` (`app.js:1383`) queda colgada con `ui.leaving = true` hasta ese momento.
- **Evidencia:** `net.js:337-338`, `383-390` y `237-242`; `app.js:1381-1386`.
- **Reproducción:** `a2-2-pendientes-tras-sesion-perdida.test.mjs`.
- **Clasificación:** lógica del cliente de red (net.js), no del servidor. El servidor no puede distinguir el comando, porque el `id` es nuevo para la sesión nueva.
- **Severidad propuesta:** P2.
- **Confianza:** confirmado leyendo.

### A2-3 · «Sin conexión» y «fuera» pueden llegar hasta 5 s antes de lo que dice la regla
- **Modos:** todos (HEAD_START y ACTIVE).
- **Descripción:** `seen()` pasa al motor como mucho una señal cada 5 s (`SEEN_EVERY_MS`) y descarta las demás **sin anotar su hora**.
  - Si la última señal real llega 4,9 s después de la última que se pasó al motor, los plazos se cuentan desde la anterior: «sin conexión» a los 25,1 s y fuera a los 4 min 55 s.
  - Afecta sobre todo a quien solo envía `ping`: sin GPS, con el permiso denegado o con la web sin seguimiento. Una lectura `loc` aceptada sí actualiza `lastSeenAt` al momento (`engine.ts:674`).
- **Evidencia:** `hub.ts:57` y `657-665`.
- **Reproducción:** `a2-3-presencia-adelantada.test.mjs`.
- **Clasificación:** lógica del servidor.
- **Severidad propuesta:** P3, porque es una desviación pequeña de D-057 (30 s / 5 min desde la última señal).
- **Confianza:** confirmado leyendo.
- **Arreglo posible sin cambiar la regla:** guardar siempre la hora de la última señal y pasarla al motor perezosamente, antes de evaluar los plazos.

### A2-4 · Un `cmd` nulo o sin campo `cmd` provoca un error interno y cierra la conexión con 1011
- **Modos:** todos.
- **Descripción:** `protocol.ts:69` acepta cualquier valor en `cmd`, también `null` o la ausencia del campo. `Hub.command` llama a `run(room, pid, null)`, y `run` accede a `cmd.type` (`hub.ts:676-677`), lo que lanza `TypeError`.
  - `main.ts:275-283` lo captura, cierra con 1011 y registra `server_error`.
  - Los demás jugadores ven «desconectado» y después «conectado».
  - Solo afecta a quien lo envía, y el motor no llega a cambiar el estado.
- **Evidencia:** `protocol.ts:69`, `hub.ts:540-553` y `672-677`.
- **Reproducción:** `a2-4-cmd-nulo.test.mjs`.
- **Clasificación:** lógica del servidor (validación).
- **Severidad propuesta:** P3.
- **Confianza:** confirmado leyendo.
- **Huecos de las pruebas:** `hostile.test.mjs` no prueba `cmd: null` con sesión.

### A2-5 · Una suspensión del servidor de entre 30 y 60 s no se perdona: todos pasan a «sin conexión» a la vez
- **Modos:** todos.
- **Descripción:** `SUSPEND_GAP_MS = 60 s` es mayor que `awayAfterMs = 30 s`. Al despertar de una suspensión de entre 30 y 60 s (tapa del portátil un momento), `forgiveAbsence` no se ejecuta.
  - El primer `pump` marca a **todos** los jugadores «sin conexión», y todos reciben un aviso por cada uno.
  - Segundos después llegan otros N avisos de «ha vuelto».
  - D-057 dice que tras una suspensión «el plazo empieza de cero».
  - Además, `forgiveAbsence` no reinicia `away` ni emite nada, aunque eso se corrige con la siguiente señal.
- **Evidencia:** `hub.ts:60` y `837-855`.
- **Reproducción:** `a2-5-suspension-corta.test.mjs` (simula la suspensión moviendo `Date.now` y el reloj del juego).
- **Clasificación:** lógica del servidor.
- **Severidad propuesta:** P3 (o P2 si el anfitrión suele cerrar la tapa del portátil).
- **Confianza:** confirmado leyendo.
- **Arreglo posible:** un umbral menor que 30 s, por ejemplo 15 s, porque el despertador vuelve cada segundo como mucho.

### A2-6 · No se descuenta la latencia de red al calcular la antigüedad de una lectura
- **Modos:** todos (validación de capturas).
- **Descripción:** `age` se mide al **enviar** y el servidor calcula `measuredAt = now − age` al **recibir** (`hub.ts:643`, `net.js:431`, `app.js:402`).
  - En una red móvil que retiene el envío del WebSocket varios segundos (cobertura mala que vuelve), la lectura llega como si fuera más reciente de lo que es.
  - Las capturas exigen como mucho 15 s, pero ese margen no incluye el tiempo de tránsito.
  - Por HTTP el retraso está acotado a 10 s (tiempo de espera de Android); por WebSocket no está acotado.
- **Clasificación:** limitación de diseño (servidor y cliente).
- **Severidad propuesta:** P3.
- **Confianza:** probable (depende de la red).
- **Script:** no hay. Se podría probar enviando por el socket un `loc` con `age: 0` tras retenerlo 20 s.

### A2-7 · El reloj autoritativo es la hora de pared (`Date.now`), no un reloj monótono
- **Modos:** todos.
- **Descripción:** `Hub` usa `Date.now` como `now` (`hub.ts:198`).
  - Si Windows corrige la hora a saltos (sincronización al despertar), un salto **hacia atrás** de X s hace que el motor descarte todas las lecturas durante X s (`recordSample`: `effectiveAt <= last`). Las posiciones se congelan y la presencia se retrasa.
  - Un salto **hacia delante** adelanta los plazos: pistas, final y «sin conexión». Si pasa de 60 s, se toma por una suspensión.
- **Evidencia:** `hub.ts:198`, `location.ts:83` y `hub.ts:838`.
- **Clasificación:** lógica del servidor o del entorno.
- **Severidad propuesta:** P3.
- **Confianza:** sospecha (no se ha comprobado cómo corrige la hora este equipo).

### A2-8 · Los mensajes descartados por el límite de frecuencia no tienen respuesta
- **Modos:** todos.
- **Descripción:** `allow()` devuelve `false` y el mensaje se descarta en silencio (`hub.ts:404`).
  - Un `cmd` descartado deja su promesa pendiente en `net.js` hasta la próxima reconexión, que lo reenvía con el mismo id.
  - Con el uso normal (lecturas 1/s, ping cada 10 s) no se llega al límite de 30 en ráfaga y 10/s. Solo pasaría con avalanchas: muchos comandos pendientes reenviados de golpe en el `welcome` más el reenvío de los perdidos.
- **Clasificación:** lógica del servidor.
- **Severidad propuesta:** P3.
- **Confianza:** confirmado leyendo (la probabilidad es baja).

### A2-9 · `claim_tag` sirve de sonda sobre el GPS de un fugitivo
- **Modos:** Clásico e Infección.
- **Descripción:** un cazador con lectura buena puede reclamar a cualquier fugitivo cada 3 s. El código de error dice cosas del GPS del fugitivo que el cazador no debería saber fuera de las pistas, aunque nunca la distancia ni la posición:
  - `target_location_stale`: no hay lectura en 15 s;
  - `accuracy_too_low`: la precisión pasa de 30 m (también puede deberse a la del propio cazador);
  - `target_location_unstable`: ha dado un salto.
  - `player_presence` ya hace pública la falta de señal a los 30 s; esto la da antes.
- **Evidencia:** `engine.ts:836-842`.
- **Clasificación:** lógica del servidor.
- **Severidad propuesta:** P3.
- **Confianza:** confirmado leyendo.

### A2-10 · `runner_captured` y `captures` envían `hunterId` a todos durante la partida en Clásico
- **Modos:** Clásico (en Infección y Fox es público por diseño).
- **Descripción:** la tabla §11.4 dice que los roles de los demás están «ocultos hasta el final», y GSM §6.4 dice que nunca se envía lo que el cliente oculta.
  - Durante la partida, todos los fugitivos reciben quién capturó (`runner_captured.hunterId` y `snapshot.captures`). La interfaz no lo muestra a mitad de partida (`app.js:362-365`).
  - Sin embargo, **no es una fuga nueva**: cada jugador ve el equipo de sus compañeros (`teamVisibleTo`), así que deduce el resto por eliminación.
  - Lo que hay que aclarar es la documentación: «ocultos» solo significa «no mostrados».
- **Evidencia:** `engine.ts:461-463`, `view.ts:149-158` y `200`.
- **Clasificación:** lógica del servidor (coherencia con la documentación).
- **Severidad propuesta:** P3, informativo.
- **Confianza:** confirmado leyendo.

### A2-11 · Tras reiniciar después de un rato parado, las pistas atrasadas salen vacías y la exposición sale sin posición
- **Modos:** todos (con STATE_FILE).
- **Descripción:** `exportState` borra las lecturas. Si el servidor está parado más que el intervalo de pistas, al restaurar `pump` emite seguidas todas las pistas vencidas, con todos los fugitivos «sin señal».
  - Una exposición vencida (con `outsideSince` guardado) hace visible a un fugitivo sin posición hasta su siguiente lectura.
  - Se respeta el «final por tiempo va antes».
- **Evidencia:** `hub.ts:259-260`, `engine.ts:332-345` y `199-203`.
- **Clasificación:** lógica del servidor.
- **Severidad propuesta:** P3.
- **Confianza:** probable.

### Riesgo conocido, no nuevo
Detrás del túnel **sin** `TRUST_PROXY=1`, los fallos de sesión cuentan por IP compartida (`hub.ts:368-387` y `614-619`). Tras un reinicio sin STATE_FILE, 20 reanudaciones o envíos fallidos en un minuto dan `rate_limited` a todos para crear o entrar durante 1 min. Está documentado y el script de arranque usa `TRUST_PROXY=1`.

## 4. Pruebas de integración que faltan

1. Pérdida del `welcome` en `join` y en `create`, y reintento desde el mismo dispositivo (A2-1).
2. Comandos pendientes cuando la sesión se pierde (`bad_session`, `removed`, 4000) y creación de otra sala (A2-2).
3. Hora exacta de «sin conexión» y de quedar fuera **con pings reales cada 10 s** y sin `keepAliveConnected`. `advance()` da señal de vida a todos los conectados cada 20 s (`helpers.mjs:30-37`), así que las pruebas nunca ejercitan la cadencia real ni el límite de 5 s (A2-3).
4. `cmd: null` y `cmd` ausente con sesión válida (A2-4).
5. Suspensión del servidor (mayor y menor de 60 s). Hoy no se puede probar porque `checkSuspended` usa `Date.now` sin inyección; conviene un `wallNow` en `HubOptions` (A2-5).
6. Reanudar justo después de una conversión en Infección: `role_changed` reenviado, `canTagFrom`, sin la última pista anterior y sin posiciones de fugitivos en el siguiente `positions`.
7. Captura en el mismo milisegundo que `head_start_end`, `game_end` y la caducidad de la reclamación, y el último fugitivo quedando fuera por presencia en el mismo instante que el final.
8. Reinicio con STATE_FILE tras más tiempo parado que el intervalo de pistas (A2-11), y en Infección con un convertido en espera.
9. Comprobación automática de fugas: recorrer todos los mensajes `raw` de cada jugador en una partida completa de cada modo y verificar que ninguno lleva el equipo, la posición o la pista de un rival fuera de lo permitido. Hoy se comprueba caso por caso.
10. Reenvío de eventos de la partida anterior tras la revancha y una recarga (cola sin vaciar entre partidas): que la interfaz no muestre avisos antiguos.

## Scripts (no ejecutados)
Están en `C:\Users\aange\AppData\Local\Temp\claude\C--Users-aange\e108e3b2-532d-48d6-89f2-6b46f764d244\scratchpad\agente2\`:
- `a2-1-join-fantasma.test.mjs`
- `a2-2-pendientes-tras-sesion-perdida.test.mjs`
- `a2-3-presencia-adelantada.test.mjs`
- `a2-4-cmd-nulo.test.mjs`
- `a2-5-suspension-corta.test.mjs`

Se ejecutan con `node --test <archivo>` desde la raíz del repositorio. Usan `testServer` en un puerto efímero, nunca 127.0.0.1:8787. Si el fallo existe, **pasan**: sus aserciones describen el fallo.
