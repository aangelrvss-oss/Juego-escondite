# Agente 3 · QA de Infección · informe (solo lectura)

Rama `mapa-real`, código sin commit leído el 30/10/2026. No se ha ejecutado nada. Los scripts del scratchpad están sin ejecutar y llevan el resultado esperado en cada `it`:
- `agente3/motor-infeccion-casos.test.ts`: motor puro y funciones del cliente; n = 4…20 y casos de borde.
- `agente3/sim-infeccion-escenarios.test.mjs`: 10 escenarios con el simulador de 10 jugadores.

## 1. Matriz de pruebas

Leyenda de «qué comprueba»: **E** = efecto real en el estado o en lo recibido; **L** = solo la llamada o el valor de una función; **—** = no cubierto.

| # | Caso | Regla | Prueba existente (archivo: test) | Qué comprueba | Hueco |
|---|---|---|---|---|---|
| 1 | Mínimo de jugadores | §11.2 mín. 4 | engine/test/infection.test.ts: «necesita al menos 4 jugadores»; mobile/test/modes.test.mjs: «la sala dice que Infección necesita 4…»; e2e infeccion: «con 3 no se puede empezar» | E (start rechazado con 3, acepta con 4), L (texto), E (botón deshabilitado) | Salidas en la cuenta atrás que bajan de 4 (backToLobby) solo están cubiertas en Clásico/Fox |
| 2 | Reparto n=4,5,7,8,9,12,20 | max(1,floor(n/4)) | engine: «cazadores iniciales: max(1, floor(n/4))» | **L**: solo `MODES.infection.hunters(n)`, no un `start` real | n=11 y n=16 no están; `resolveTeams` real solo con n=4 (20 semillas) |
| 3 | Reparto con sorteo real | exactos | engine: «el sorteo da exactamente esos cazadores» (n=4); sim/panel/test: «infection: 10 participantes… (2 cazadores)» | E con n=4 y n=10 | n=5,7,8,9,11,12,16,20 sin `start` real → `motor-infeccion-casos.test.ts` |
| 4 | Asignación manual que no cuadra | teams_unbalanced | engine: mismo test (n=5, 2 cazadores a mano) | E (error + detalle) | Sin «todos fugitivo», sin «cuadra exacto → empieza» para n≥8, sin exceso con n grande |
| 5 | Inicio y paso a persecución | fases comunes | engine `infectionGame()`; server `infection()`; e2e | E | — |
| 6 | Captura válida (reclamación + confirmación) | conversión | engine: «la captura confirmada lo convierte…»; server: «conversión: todos lo saben…»; e2e | E | — |
| 7 | «Me han pillado» | conversión | engine: «también con Me han pillado»; server: «si caen todos…» | E | La autodeclaración con reclamación pendiente de otro cazador no está probada |
| 8 | Rechazo nunca convierte | §11.2 | engine: «un rechazo nunca convierte» | E | — |
| 9 | Conversión: equipo, lecturas borradas, avisos | §11.2 | engine (audiencias), server (eventos por jugador) | E | — |
| 10 | Visibilidad tras convertir | ve cazadores, no fugitivos | engine: «al convertirse deja de ver…»; server: positions tras `advance(6 s)` | E en el servidor | **El cliente sigue mostrando las posiciones antiguas hasta el siguiente envío (A3-1)**; la prueba del servidor espera al envío siguiente y lo oculta |
| 11 | Tarjeta del convertido | «Te han infectado · ahora eres CAZADOR» | e2e infeccion: «Beto ve Te han infectado…» | E (DOM) | Sin reconexión ni recarga después de convertirse: la tarjeta se pierde (A3-2). Dura 15 s, no «hasta que la toque» (A3-4) |
| 12 | Espera de 60 s | tag_cooldown | engine: «el convertido espera 60 s…» (10 s → error, 61 s → ok); server: error a los pocos s; sim: `canTagFrom-convertedAt=60 000` | E | Sin borde exacto (59 999 / 60 000) → script |
| 13 | Sin atribución de autodeclaración en la espera | §11.2 | engine: «Me han pillado no atribuye…» (0 s / 61 s) | E | Borde exacto; la interfaz ofrece al convertido en la lista y descarta el nombre sin avisar (A3-10) |
| 14 | No recibe la última pista ya emitida | §11.2 | engine: «no recibe la última pista…», «si la pista vence en el mismo paso…»; server: `lastPing null` + pista 2 | E | — |
| 15 | Cadena de contagio | informe | mobile/test/modes.test.mjs: «cadena de contagio…» (lineal); e2e: «Contagio: Ana → Beto → Caro» | L (función pura) | **Las ramas no se muestran (A3-3)**; la e2e da por buena una cadena sin Dani, que también infectó Beto |
| 16 | Último superviviente | informe | modes.test: «todos infectados, con el último superviviente»; e2e | L / E | Solo con `all_captured`; sin línea con tiempo agotado y 1 libre ni con abandono (A3-9) |
| 17 | Resultado personal | «Te infectó X…; después infectaste a N» | modes.test: «resultado personal del convertido»; e2e `.result-me` | L / E | Autodeclarado sin autor («Te declaraste infectado») sin probar en la interfaz |
| 18 | Desconexión del convertido (30 s) | presencia | engine: «el convertido que se desconecta…» (2 min) | E parcial: solo equipo y estado, no `away` | No comprueba `away` ni el aviso; sim: desconexiones solo en Clásico |
| 19 | Reconexión del convertido | rol y pistas | server: `socket.close()` → sigue cazador y sin pista anterior | E | Reconexión después de 15 s (tarjeta, A3-2) |
| 20 | Fuera a los 5 min (convertido / último fugitivo / todos los cazadores) | D-057 §1 | Ninguna en Infección (sim/panel/test lo prueba en Clásico, y con `if (phase==='ACTIVE')`) | — | **Hueco total en Infección** → scripts del motor y SIM-INF-05/06/08 |
| 21 | Final: todos infectados | ganan cazadores | engine, server, e2e | E | — |
| 22 | Final: tiempo agotado | supervivientes | engine: «si se acaba el tiempo…» | E | Confirmación tras `gameEnd` sin probar (script) |
| 23 | Final: abandono/gracia del último fugitivo o de los cazadores | sin ganador | — | — | **Hueco en Infección** (script + SIM-INF-06/08) |
| 24 | Revancha | sorteo nuevo, sin arrastre | engine: «la revancha… nadie arrastra la conversión» (tras `start`); e2e: revancha con «Sorteo» | E solo después de `start` | Entre el final y `start` quedan `convertedAt`/`canTagFrom` (A3-5); `swapRoles:true` en Infección sin probar |
| 25 | Simulador con 10 | todo | sim/panel/test: «infection: 10 participantes…», «Infección: el capturado pasa a cazador…» | E con n=10 | No hay revancha, autodeclaración, asignación manual ni otros tamaños en el simulador |

## 2. Lo que hace el código en los casos especiales

- **Captura justo antes o justo después de los 60 s:**
  - `claimTag` comprueba `now < canTagFrom`, así que a 59 999 ms da `tag_cooldown` y a 60 000 ms exactos la acepta (engine.ts:826).
  - La espera se comprueba antes que la posición, la zona y la distancia.
  - La autodeclaración sigue el mismo borde: con `waiting = now < canTagFrom` no se atribuye a 59 999 y sí a 60 000 (engine.ts:725-726).
  - La interfaz oculta los nombres mientras `canTagFrom - serverNow() > 0` (app.js:952-955). Si el reloj del móvil va desfasado, la reclamación puede rechazarse con «aún no puedes capturar»; el motor manda.
- **Dos capturas casi simultáneas sobre el mismo fugitivo:** los comandos se procesan en serie.
  - Mientras la primera reclamación está pendiente, la segunda da `already_pending` (engine.ts:831).
  - Si llega después de la conversión, da `target_not_active`, porque el equipo ya no es `runner` (engine.ts:828), no `already_captured`.
  - Un «Me han pillado» repetido da `not_a_runner` (engine.ts:710).
  - Si hay una reclamación pendiente, la autodeclaración se atribuye a quien reclamó, aunque el fugitivo elija a otro (engine.ts:713-717).
  - Resultado: una sola conversión y una sola entrada en `captures`.
- **Dos capturas sobre fugitivos distintos:** cada conversión llama a `checkEnd`. Si son los dos últimos, la segunda termina la partida con `all_captured`. Un mismo cazador no puede tener dos reclamaciones a la vez (`pendingClaimFor(hunter)`).
- **El convertido pierde la conexión:**
  - Sigue en `team='hunter'` y `status='active'`, y cuenta como cazador en `checkEnd`.
  - `canTagFrom` es una hora absoluta, así que la espera sigue corriendo sin él.
  - A los 30 s ve «sin conexión» (`away`, aviso a todos) y a los 5 min queda fuera (`withdraw('timeout')`). Si era el último cazador, la partida acaba con `hunters_abandoned` y sin ganador.
  - Como la conversión exige un comando suyo (`lastSeenAt` reciente), no puede quedar fuera durante la espera.
- **Vuelve antes de 5 min:** `markSeen` lo devuelve a la partida («ha vuelto») y recibe una vista con `canTagFrom` (o `null` si ya pasó). La pista nueva le llega si `pingNo > pingsBeforeConversion` (view.ts:163-165). Pero si vuelve después de 15 s, la tarjeta y el aviso no se muestran porque el evento repetido se considera antiguo (A3-2).
- **Vuelve después de 5 min:** sigue `left` con `leftReason='timeout'` y solo recibe eventos de audiencia `all` (view.ts:12-16). Ve la pantalla «Estás fuera de la partida» (app.js:1062-1069) y puede unirse a la revancha, porque no tiene `leftRoom`. En el informe sale «Infectado a los mm:ss · sin conexión», y su resultado personal es el de los cazadores.
- **Quedan pocos fugitivos o no hay capturas posibles:** la partida no termina sola.
  - Las reclamaciones necesitan lecturas recientes de las dos partes, de menos de 15 s.
  - Esto pasa con fugitivos sin señal, cazadores en su espera, cazadores fuera de la zona o un único cazador desconectado.
  - Solo acaba por tiempo, cuando alguien queda fuera a los 5 min (con el último fugitivo fuera, `runners_abandoned`, sin ganador aunque los demás estén infectados) o por el anfitrión (`ended_by_host`).
- **Revancha tras Infección:**
  - `rematch()` limpia `claims`, `captures`, `lastPing`, `pingCount` y `outcome`, y deja `team` y `teamPref` en `random` (`swapRoles` se ignora en Infección).
  - **No** limpia `convertedAt`, `canTagFrom` ni `pingsBeforeConversion`; eso solo lo hace `start()` (engine.ts:797-799).
  - En el final y en la sala de la revancha, la vista puede llevar `canTagFrom` si no han pasado 60 s (A3-5). Al empezar se limpia todo; la cadena sale de `captures`, que ya está vacío.
- **El informe no atribuye contagios incorrectos:**
  - Una autodeclaración que elige a un convertido en su espera se guarda con `hunterId=null`.
  - Un convertido no puede crear reclamaciones durante la espera, así que no hay reclamaciones suyas que atribuir.
  - Una reclamación caducada se borra y emite `expired`. Si después el fugitivo se autodeclara, se atribuye al cazador que **él elija** (activo y fuera de su espera), sin validación GPS, igual que en Clásico.
  - Una reclamación cancelada por abandono no genera ninguna entrada.
  - Las cadenas con `hunterId=null` empiezan en el propio infectado.
  - Error encontrado: la cadena omite contagios reales (A3-3). No es una atribución falsa, sino una omisión.

## 3. Hallazgos

### A3-1 · Durante unos segundos tras la conversión, el cliente sigue mostrando las posiciones del equipo anterior · P2 · confianza alta
- **Qué pasa:** tras la conversión, el servidor solo manda la vista. Las posiciones se envían en el siguiente `broadcastPositions` del `pump`, cada 5 s (`positionsIntervalMs`).
- **Evidencia:**
  - hub.ts:686-705: `commit` envía la vista, no las posiciones.
  - hub.ts:783-805: el envío periódico de posiciones.
  - app.js:278-285: `role_changed` no vacía `ui.positions`.
  - app.js:362-364: `runner_captured` tampoco.
- **Consecuencias:**
  - El convertido sigue viendo a sus antiguos compañeros fugitivos durante 5 s como mucho.
  - Además, `mapModel` los dibuja como «Tu equipo» con el color del cazador (game-view.js:448-451: `dotTeam = team`, que ya es `hunter`).
  - Los fugitivos siguen viendo al convertido como compañero durante el mismo intervalo.
- **Contradice:** §11.2 («deja de ver a los fugitivos… al instante», §3.3). La prueba del servidor lo oculta porque espera al envío siguiente (server/test/infection.test.mjs:69-70).
- **Reproducción:** en la interfaz real del simulador, a velocidad ×1, haz jugar a un fugitivo desde la interfaz y confirma una captura. Mira el mapa durante los primeros 5 s: puntos de fugitivos con color de cazador.
- **Solución sugerida:** vaciar `ui.positions` al recibir `role_changed` y quitar al convertido al recibir `runner_captured`, o enviar las posiciones en el mismo `commit`.

### A3-2 · La tarjeta «Te han infectado» se pierde si el evento llega repetido más de 15 s después · P2 · confianza alta
- **Evidencia:**
  - game-view.js:394-399: `isStaleEvent` exime a `tag_claimed` y a `role_revealed` (en la huida), pero no a `role_changed`.
  - app.js:280: `if (!stale) ui.reveal = …`.
  - El aviso `runner_captured` también se considera antiguo.
- **Reproducción:** el fugitivo confirma la captura con mala cobertura y el móvil reconecta (o se recarga) más de 15 s después. Ve el chip «CAZADOR» y la espera, pero no la tarjeta obligatoria (§11.2 Avisos) ni ningún aviso.
- **Prueba:** `motor-infeccion-casos.test.ts`, «role_changed repetido…».
- **Solución sugerida:** tratar `role_changed` como vigente mientras `snap.canTagFrom` siga en el futuro, o mientras la tarjeta no se haya tocado.

### A3-3 · La cadena de contagio solo sigue la primera rama · P2 · confianza alta
- **Evidencia:** game-view.js:248-263. `follow` toma `victims(id).find(...)`, la primera, y las raíces son solo cazadores iniciales o autodeclarados sin autor.
- **Ejemplo:** h infecta a A y a B, A infecta a C y B infecta a D. Sale `[[h,A,C]]`: B y D no aparecen en ninguna cadena.
- **Alcance:**
  - La e2e lo da por bueno: «Contagio: Ana → Beto → Caro», aunque Beto también infectó a Dani (mobile/e2e/infeccion.e2e.mjs, comprobación del informe).
  - Con 10 jugadores y 2 cazadores iniciales, lo normal es que falte la mitad de los contagios.
  - La cronología sí los lista todos.
- **Pendiente de producto:** decidir si «cadena» debe ser un árbol o una línea por cada contagio.
- **Prueba:** script «[HALLAZGO A3-3]» y SIM-INF-01 (imprime `fuera_de_cadena`).

### A3-4 · La tarjeta del convertido dura 15 s y su texto es fijo · P3 · confianza alta
- app.js:278-280: el comentario dice «se queda hasta que la toque», pero `until = now + 15 000`.
- app.js:1091-1092: el texto dice siempre «Podrás capturar dentro de 1 min», sin usar `canTagFrom`. Tras una recarga a los 50 s, seguiría diciendo 1 min.

### A3-5 · El estado de conversión sobrevive al final y a la revancha hasta `start()` · P3 · confianza alta
- **Evidencia:**
  - engine.ts:362-383 (`finish`) y engine.ts:931-975 (`rematch`) no limpian `convertedAt`, `canTagFrom` ni `pingsBeforeConversion`.
  - view.ts:208: `canTagFrom` va en la vista si es futuro, también en el final y en la sala.
  - sim/panel/www/panel.js:179: el panel sigue mostrando «· infectado» en la sala de la revancha.
- **Efecto:** ninguno en el juego, porque `start()` lo limpia (engine.ts:797-799). Es higiene del estado y puede confundir en la sala.
- **Prueba:** script «[HALLAZGO A3-5]» y SIM-INF-09.

### A3-6 · Códigos de error de la segunda captura distintos de la propuesta §3.4 · P3 · confianza alta
- engine.ts:828 y engine.ts:710 dan `target_not_active` y `not_a_runner`; §3.4 proponía `already_captured`.
- La interfaz dice «Ese jugador no está libre», que es aceptable. Basta documentarlo o alinearlo.

### A3-7 · Una salida en la cuenta atrás deja los cazadores descuadrados · P3 · confianza alta
- engine.ts:889-893 solo vuelve a la sala si hay menos de 4 jugadores o un equipo queda vacío.
- Ejemplo: con n=8 (2 cazadores), si salen 4 fugitivos en la cuenta atrás se juega 2 contra 2, aunque «exactos» pedía 1 para 4.
- Pendiente de producto: ¿«exactos» vale solo al empezar? (script «[HALLAZGO A3-7]»).

### A3-8 · Fallos del registro del simulador · P3 (herramienta) · confianza alta
- simulacion.mjs:524-527: `runner_exposed`/`runner_unexposed` leen `d.playerId`, pero el motor envía `runnerId` (engine.ts:290-292), así que el registro dice «— expuesto».
- simulacion.mjs:516-517: una infección autodeclarada sin autor se describe como «infectado por —».
- simulacion.mjs:557-560: `outcomeText` dice «ganan los fugitivos» en Infección.
- El simulador no tiene acciones de revancha, autodeclaración ni asignación manual, y siempre son 10 jugadores (`NAMES`). Los escenarios tienen que llamar a `avatar.command` directamente.

### A3-9 · «Último superviviente» solo cuando caen todos · P3 · confianza alta (necesita decisión de producto)
- game-view.js:205-208: con tiempo agotado y un único libre, o con abandono, no hay línea de último superviviente. La regla de D-057 no lo limita.

### A3-10 · El fugitivo puede elegir a un convertido en espera como autor y su elección se descarta sin aviso · P3 · confianza alta
- app.js:1116-1121: la lista sale de `rivals()`, que incluye a todos los que no son compañeros, convertidos en espera incluidos.
- engine.ts:725-726: el motor guarda `hunterId=null`.
- El fugitivo no recibe ninguna explicación y su resultado dice «Te declaraste infectado». Es correcto según la regla, pero confuso.

### A3-11 · El error de equipos descuadrados no dice la cifra concreta · P3 · confianza alta
- game-view.js:98: dice «1 cazador por cada 4 jugadores (al menos 1)» sin decir «con 9 jugadores: 2».
- Los jugadores no pueden fijar su propia preferencia desde la interfaz, así que solo afecta al anfitrión.

### A3-12 · Calidad de las pruebas existentes · P3 · confianza alta
- engine «dos confirmaciones del mismo fugitivo» prueba confirmar y luego autodeclararse el mismo fugitivo, no a dos cazadores.
- engine «cazadores iniciales» es una llamada pura y le faltan n=11 y n=16.
- engine «el convertido que se desconecta» no llega a 5 min ni comprueba `away`.
- La prueba del simulador con 10 solo valida n=10.
- La e2e fija una cadena incompleta (A3-3).

No se ha encontrado ningún P0 ni P1. El núcleo de la regla está bien en el servidor: conversión atómica, espera, pista anterior, filtrado por audiencia (calculada después del paso y con ids fijados al emitir), finales y presencia.

## 4. Huecos de cobertura (resumen)
1. Infección con 5 min sin señal: convertido, último fugitivo y todos los cazadores (sin ganador). No existe ninguna prueba.
2. Reparto con `start` real para n = 5, 7, 8, 9, 11, 12, 16, 20, y asignación manual exacta o con exceso por tamaño.
3. Bordes exactos de 60 s, tanto en la reclamación como en la atribución.
4. Dos cazadores sobre el mismo fugitivo; autodeclaración con reclamación pendiente de otro.
5. Confirmación que llega después de `gameEnd`.
6. Cliente: posiciones tras convertirse (A3-1), tarjeta tras reconectar (A3-2), cadena con ramas (A3-3).
7. Revancha: estado entre el final y `start`, y `swapRoles:true` en Infección.
8. Interfaz con un número de jugadores distinto de 4 (e2e) o de 10 (simulador).

## 5. Escenarios del simulador (10 jugadores, 2 cazadores iniciales)
Archivo: `agente3/sim-infeccion-escenarios.test.mjs`. Cada escenario se puede repetir a mano desde el panel con las mismas acciones.

| ID | Acciones (panel / API) | Qué comprobar |
|---|---|---|
| SIM-INF-01 | Empezar Infección; «Avanzar» de 1 min en 1 min hasta el final | 2 cazadores iniciales; toda captura `converted`; ninguna captura de un convertido antes de su conversión + 60 s; `canTagFrom-convertedAt=60 000`; el resultado coincide con el estado; anotar cuántos infectados quedan fuera de la cadena (A3-3) |
| SIM-INF-02 | «Captura válida»; esperar la conversión | `role_changed` solo para él; `visiblePositions` del convertido solo con cazadores; ningún fugitivo lo ve; `canTagFrom` en su vista; reclamación en la espera → `tag_cooldown`; en la interfaz real (jugador en la interfaz): tarjeta y puntos de los primeros 5 s (A3-1) |
| SIM-INF-03 | Conversión; otro fugitivo se autodeclara eligiendo al convertido; avanzar 65 s y repetir | `hunterId=null` dentro de la espera; con autor fuera de ella |
| SIM-INF-04 | Pausa; colocar 2 cazadores junto a un fugitivo; dos reclamaciones a la vez; reanudar | una `ok` y una `already_pending`; una sola conversión |
| SIM-INF-05 | Conversión; «Desconectar» al convertido 35 s; «Restaurar»; otro convertido «Desconectar» 5 min 10 s | `away` a 30 s y sigue cazador; vuelve; el segundo queda `left/timeout` y la partida sigue |
| SIM-INF-06 | 7 de 8 fugitivos se autodeclaran; «Desconectar» al último; avanzar 5 min 10 s | `{winner:null, cause:'runners_abandoned'}`; el informe dice «sin conexión» |
| SIM-INF-07 | Los 8 fugitivos se autodeclaran | `all_captured`, «Todos infectados», 8 capturas; comprobar «Último superviviente» y la cadena en la interfaz |
| SIM-INF-08 | Conversión; los cazadores iniciales salen o se desconectan 5 min; después el convertido | la partida sigue mientras quede un convertido (aunque esté en su espera); después `hunters_abandoned` |
| SIM-INF-09 | Todos infectados; Revancha; todos se unen; «listo»; empezar | en la sala: restos de `convertedAt`/«· infectado» (A3-5); tras empezar: Infección, 2 cazadores, `captures=[]`, `canTagFrom=null` |
| SIM-INF-10 | «Congelar» a los cazadores 4 min, «Restaurar», avanzar hasta el final | si queda alguien libre: `{winner:'runner', cause:'time_up'}` |

Extra manual con la interfaz real («Jugar desde la interfaz» para un fugitivo):
- convertirse, recargar a los 20 s y comprobar que falta la tarjeta (A3-2);
- tocar «Me han pillado» y elegir a un convertido en su espera (A3-10).

**Advertencia:** con 10 jugadores solo se prueba floor(10/4)=2. Los tamaños 4, 5, 7, 8, 9, 11, 12, 16 y 20 están en `motor-infeccion-casos.test.ts` (motor real, sin red).

## 6. Pendiente de validación física (móviles reales, GPS real)
1. Conversión con la pantalla bloqueada o la app en segundo plano justo después de confirmar: ¿llega la tarjeta? (A3-2).
2. El mapa del convertido en los primeros 5 s (A3-1) y el de los fugitivos que lo tenían como compañero.
3. Primera reclamación de un convertido a los 60 s con GPS real: sus lecturas se borraron al convertirse y necesita una lectura nueva estable, sin salto y con precisión ≤30 m.
4. La espera de 60 s según el reloj del móvil frente al del servidor (cuenta en la barra y aparición de los nombres).
5. La ubicación sigue enviándose en segundo plano tras cambiar de equipo (Android, `POST /api/loc`).
6. Vibración y aviso a todos «X ha sido infectado» en varios modelos.
7. Último fugitivo sin cobertura 5 min en la calle: final sin ganador y explicación en su móvil al volver.
8. Grupos de 4–5 (1 cazador) y de 8–9 (2 cazadores) para comprobar el ritmo; el mínimo de 4 en la calle.
9. Revancha inmediata tras un final rápido (menos de 60 s desde la última conversión).
