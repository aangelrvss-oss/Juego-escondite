# Agente 4 · QA de Caza del zorro (`fox_hunt`, «Mr. X»): informe

Auditoría de solo lectura del árbol de trabajo (rama `mapa-real`, con los cambios sin commit). No he ejecutado pruebas, npm, servidores ni navegadores. Los scripts de reproducción están en esta misma carpeta y **no se han ejecutado**: cada uno indica el resultado que espero.

Referencias: `docs/product/GAME_MODES_AND_RULES.md` §11.1, §11.3 y §11.4, y `DECISION_LOG.md` D-057 §1 y §3.

## 0. Resumen

- **El núcleo del modo cumple la lectura de D-057 §3:**
  - un solo zorro con n−1 cazadores exactos;
  - roles públicos tras la cuenta atrás;
  - el zorro ve a los cazadores activos cada 5 s desde la huida;
  - los cazadores se ven entre sí;
  - la pista lleva solo la posición del zorro, con su antigüedad real;
  - la captura termina la partida;
  - si se acaba el tiempo, gana el zorro;
  - si el zorro abandona o queda fuera por el periodo de gracia, no hay ganador;
  - con menos de 3 en la cuenta atrás se vuelve a la sala;
  - la revancha y `swapRoles` dan un sorteo nuevo.
- **No he encontrado ninguna secuencia que deje la partida activa sin un final legítimo.** El final por tiempo siempre existe, y los plazos de presencia vacían los equipos.
- **Hallazgos:** 9.
  - **P1:** 1. El zorro puede volverse imposible de capturar por reclamación sin quedar «sin conexión».
  - **P2:** 3.
    - Un fantasma de la cuenta atrás aparece en el informe como segundo «Zorro».
    - Un jugador puede autoelegirse zorro con un comando oculto.
    - El anfitrión, que puede ser el zorro, puede anular la partida.
  - **P3:** 5.
- **Hay 9 cuestiones de diseño reales.** No elijo interpretación en ninguna.

## 1. Cómo funciona hoy (evidencia)

| Aspecto | Código |
|---|---|
| Reglas del modo | `engine/src/modes.ts:56-65`:<br>- `minPlayers: 3`;<br>- `hunters: n => n-1`;<br>- `exactHunters: true`;<br>- `onCapture: 'spectator'`;<br>- `runnersSeeHunters: true`. |
| Sorteo y asignación | `engine/src/teams.ts:12-56`. Con `exactHunters`, si `hunters !== n-1`, devuelve `null` y `start` da `teams_unbalanced/fox_hunt` (`engine.ts:778-780`). |
| Mínimo al empezar | `engine.ts:775` |
| Bajada en la cuenta atrás | `engine.ts:889-893`: vuelve a la sala si queda 0 en un equipo o menos de 3. Solo pasa con `leave`, porque en la cuenta atrás no hay plazos de presencia (`engine.ts:175`). |
| Bajada en la huida o la persecución | `checkEnd` (`engine.ts:427-440`): solo termina si un equipo queda vacío. Con zorro y 1 cazador se sigue jugando. |
| Roles públicos | `view.ts:156`: en HEAD_START y ACTIVE, entre jugadores activos o capturados. En COUNTDOWN, `null` (`view.ts:151`). |
| El zorro ve a los cazadores | `view.ts:83-84` (`hunter_seen`), en HEAD_START y ACTIVE (`view.ts:59`). Lo envía `broadcastPositions` cada 5 s (`hub.ts:204`, `hub.ts:791-805`). |
| Los cazadores se ven entre sí | `view.ts:74-75` |
| Pista | `doPing` (`engine.ts:327-349`):<br>- solo los fugitivos activos, es decir, el zorro;<br>- `ageMs = now - effectiveAt`;<br>- se envía a los cazadores activos;<br>- el zorro recibe `ping_sent` sin coordenadas. |
| Exposición | `engine.ts:199-204` y `engine.ts:286-293`. En directo con `reason: 'exposed'`, solo en ACTIVE (`view.ts:76-82`). |
| Captura | `claimTag` (`engine.ts:820-867`): exige lecturas de los dos de 15 s o menos (`TAG.maxAgeMs`), precisión de 30 m o mejor, sin salto y el cazador dentro de la zona. |
| Confirmación | `respond_tag` (`engine.ts:685-706`) |
| Autodeclaración | `engine.ts:708-730` |
| Finales | - `game_end`: gana el zorro (`engine.ts:273-275`).<br>- `all_captured` (`engine.ts:430-436`).<br>- `runners_abandoned` / `hunters_abandoned`.<br>- `ended_by_host`. |
| Informe | - `game-view.js:105`: «Zorro atrapado» / «El zorro abandonó o se quedó sin conexión».<br>- `game-view.js:210-215` y `game-view.js:293-294`: «Escapó».<br>- `app.js:1039`: grupo «Zorro». |
| Revancha | `engine.ts:962`: con `exactHunters`, `swapRoles` da `random`. El sorteo usa `seed + gameNo` (`engine.ts:778`). |

## 2. Matriz de pruebas

Leyenda de la columna «¿Efecto real?»:
- **Sí:** comprueba el efecto observable (estado del motor, mensajes recibidos o interfaz).
- **Parcial:** comprueba una parte, o solo el motor y no lo que llega al cliente.
- **No:** no hay prueba.

| # | Caso | Regla | Prueba existente | ¿Efecto real? | Hueco |
|---|---|---|---|---|---|
| 1 | Con 2 jugadores no empieza | §11.3, mínimo 3 | `engine/test/fox-hunt.test.ts:31` «necesita al menos 3 jugadores» | Sí (motor) | Falta el bloqueo en la interfaz con 2 (`startBlockers`, `game-view.js:540`). `mobile/test/modes.test.mjs:111` solo prueba el texto. |
| 2 | Con 3 empieza (tamaño mínimo) | §11.3 | `server/test/fox-hunt.test.mjs:17` (3 clientes), `mobile/e2e/zorro.e2e.mjs` (3 navegadores) | Sí | — |
| 3 | De 3 a 2 en la cuenta atrás (sale un cazador): vuelve a la sala | §11.3 | `fox-hunt.test.ts:175` | Sí (fase) | No comprueba qué queda del que sale: ver **A4-2**. |
| 4 | Sale el zorro en la cuenta atrás (con 4): vuelve a la sala | D-057 §3 y §11.3 | Solo en Clásico, en `engine/test/transitions.test.ts:199` | Parcial | No hay prueba en `fox_hunt`. Tampoco del informe de la partida siguiente: **A4-2**. |
| 5 | De 4 a 3 en la cuenta atrás (sale un cazador): sigue | §11.3 | — | No | Falta la prueba. |
| 6 | Por debajo de 3 en la huida o la persecución: sigue (1 contra 1) | Sin regla: la de 3 solo habla de la cuenta atrás | — | No | Falta la prueba y la decisión: ver la cuestión **D1**. |
| 7 | El sorteo da un único zorro | §11.3 | `fox-hunt.test.ts:39` (20 semillas, `resolveTeams`); `sim/panel/test/simulacion.test.mjs:33-35` y `:130` (10 jugadores, 9 cazadores) | Sí | — |
| 8 | Asignación manual: 1 zorro vale; 2 zorros, no empieza | §11.3 | `fox-hunt.test.ts:39`; `zorro.e2e.mjs:93-98` (selector «Zorro») | Sí | Falta la prueba de «todos cazador»: `teams.ts:44` no puede mover a nadie si no hay aleatorios y da `null`. |
| 9 | Un jugador fija su propio rol (`set_team_pref`) | §11.3: «sorteo o asignado por el anfitrión» | — | No | **A4-3** |
| 10 | Revancha: sorteo nuevo con un zorro | D-056 y §11.3 | `fox-hunt.test.ts:186` | Sí (cuenta 1 fugitivo) | No comprueba que el sorteo cambie (el mismo zorro puede repetir, y es válido). Falta la revancha en la interfaz. |
| 11 | `swapRoles`: sorteo, no intercambio | §11.3 | `fox-hunt.test.ts:186` (`swapRoles=true`) | Sí | La interfaz nunca envía `swapRoles: true` (`app.js:1366`): el caso solo existe por protocolo. |
| 12 | Roles ocultos en la cuenta atrás y públicos después | §11.3 | `fox-hunt.test.ts:79`; `server/test/fox-hunt.test.mjs:41-42`; `zorro.e2e.mjs:105-109` | Sí | — |
| 13 | Identidad estable: el equipo no cambia en la partida y sobrevive a recargas | §11.3 | `zorro.e2e.mjs:112` (recarga y rol) | Parcial | Falta comprobar el equipo tras reconectar con un hueco largo (instantánea sin repetición). |
| 14 | El zorro ve a los cazadores activos desde la huida | §11.3 | `fox-hunt.test.ts:60`; `server/test/fox-hunt.test.mjs:38`; `zorro.e2e.mjs:115-129`; `simulacion.test.mjs:130` | Sí | Falta medir la frecuencia real (5 s, `hub.ts:204`). |
| 15 | El zorro deja de ver a un cazador que sale o queda fuera | §11.3, «activos» | — | No | El filtro está en `view.ts:73`. El mapa conserva el punto hasta el siguiente envío (≤ 5 s): **A4-8**. |
| 16 | El zorro sigue viendo a un cazador «sin conexión» (30 s), con su última posición | D-057 §1 y §3 | — | No | **A4-4**: ambigüedad. |
| 17 | Los cazadores se ven entre sí y no ven al zorro en directo | §11.3 | `fox-hunt.test.ts:65`; `server/test/fox-hunt.test.mjs:51`; `zorro.e2e.mjs:126` | Sí | — |
| 18 | La pista lleva solo la posición del zorro, a los cazadores activos; el zorro recibe `ping_sent` | §11.3 | `fox-hunt.test.ts:92`; `server/test/fox-hunt.test.mjs:52-60` (comprueba lo recibido en crudo); `zorro.e2e.mjs:131-138` | Sí | — |
| 19 | La pista lleva la antigüedad real | §11.1 y §11.3 | Prueba genérica de pistas (no en `fox_hunt`) | Parcial | Falta un caso del zorro con lectura antigua o sin lectura: entrada sin posición («el zorro no tiene señal», `app.js:336`) o con UNAVAILABLE. |
| 20 | Pista con el zorro «sin conexión»: sale su última posición, con su antigüedad | D-057 §1 | — | No | **A4-4** |
| 21 | En directo si pasa más de 30 s fuera de la zona; deja de verse al volver | §11.3 | `fox-hunt.test.ts:130` (solo la exposición) | Parcial | Falta la vuelta a la zona (`runner_unexposed`) en `fox_hunt`. Falta el caso con mala precisión: **A4-1B**. |
| 22 | Filtro: el zorro no recibe la pista; un cazador no recibe al zorro fuera de pista o exposición | §11.3 | `server/test/fox-hunt.test.mjs:58-60` | Sí | — |
| 23 | Filtro: quien queda fuera por el periodo de gracia no recibe posiciones nuevas | D-057 §1 | `canReceive` (`view.ts:12-16`); pruebas de presencia genéricas | Parcial | **A4-7**: al reanudar se le repiten pistas anteriores. |
| 24 | Captura validada y confirmada: ganan los cazadores al momento | §11.3 | `fox-hunt.test.ts:107`; `server/test/fox-hunt.test.mjs:63`; `zorro.e2e.mjs:140-164` | Sí | — |
| 25 | Captura rechazada por el GPS (lejos, lectura antigua, mala precisión, salto) | §11.1 | Genérica en `engine/test/capture.test.ts`; `simulacion.test.mjs:106` (Clásico) | Parcial | No hay prueba en `fox_hunt`. Ver **A4-1**. |
| 26 | El zorro rechaza la reclamación | §11.1 | Genérica | Parcial | Rechazos ilimitados: la marca no se muestra. **A4-1C** |
| 27 | Reclamación sin respuesta: caduca | §11.1 | Genérica | Parcial | No deja ninguna marca de juego limpio. **A4-1C** |
| 28 | Dos cazadores reclaman a la vez: una sola reclamación, `already_pending` | §11.1 | `capture.test.ts:116-117` (Clásico) | Parcial | No hay prueba en `fox_hunt` ni simultánea por servidor. |
| 29 | Autodeclaración del zorro | §11.1 | Genérica | Parcial | Atribución sin comprobar la distancia: **A4-6**. |
| 30 | Reclamación pendiente al llegar el final | Sin regla (D-035 pendiente) | — | No | **A4-1D** y cuestión **D3** |
| 31 | Final una sola vez | Implícita | Ninguna específica | No | `checkEnd` solo actúa en HEAD_START/ACTIVE (`engine.ts:429`), así que no se repite. Falta una aserción de un solo `game_finished` en las rutas que coinciden (captura y tiempo en el mismo milisegundo; abandono y tiempo). |
| 32 | Se acaba el tiempo: gana el zorro | §11.3 | `fox-hunt.test.ts:118`; `mobile/test/modes.test.mjs:121-124` | Sí | Falta en el navegador (e2e). |
| 33 | El zorro abandona: sin ganador | §11.3 | `fox-hunt.test.ts:124` | Sí | El título dice «queda fuera o abandona», pero solo prueba el abandono. El otro caso está en la línea 153. |
| 34 | El zorro pasa 5 min sin señal: sin ganador, «Sin conexión» | D-057 §1 y §11.3 | `fox-hunt.test.ts:153` | Sí (motor) | Falta por servidor y simulador en `fox_hunt` (la prueba del simulador es de Clásico, `simulacion.test.mjs:57`). |
| 35 | El zorro, 30 s «sin conexión» y vuelve antes de 5 min: sigue | D-057 §1 | Genérica (Clásico) | Parcial | Falta en `fox_hunt`. |
| 36 | El zorro anfitrión abandona: el anfitrión pasa a otro, sin ganador | §11.3 | `fox-hunt.test.ts:161` | Sí | — |
| 37 | Se van todos los cazadores: sin ganador (`hunters_abandoned`) | D-057 §1 | `transitions.test.ts:196` (Clásico) | Parcial | No hay prueba en `fox_hunt`. Cuestión **D2**. |
| 38 | Un cazador «sin conexión» 5 min queda fuera y la partida sigue | D-057 §1 | Genérica | Parcial | — |
| 39 | El informe distingue al zorro de los cazadores | §11.3 | `mobile/test/modes.test.mjs:100-125`; `zorro.e2e.mjs:153-161` | Sí | **A4-2**: un segundo «zorro» fantasma. |
| 40 | Clásico e Infección no cambian | D-057 | `fox-hunt.test.ts:138` | Sí | — |
| 41 | Un cliente manipula la identidad o el rol del zorro | Seguridad | Validación de forma en `validate.ts`; las sesiones van ligadas al jugador | Parcial | **A4-3**, **A4-6**; posición falsa en **A4-1** |
| 42 | Un mensaje atrasado revela una posición incorrecta | Privacidad | `net.js` (secuencia y huecos) | Parcial | **A4-7**, **A4-8**; un salto de GPS en la pista: **A4-9** |
| 43 | ¿La partida puede quedar activa sin un final legítimo? | — | — | Revisado en el código | No he encontrado ninguna secuencia: `game_end` siempre existe tras HEAD_START (`engine.ts:267`). |
| 44 | El anfitrión termina la partida | Común | `transitions.test.ts:127` | Sí | **A4-5** (anfitrión zorro) |

## 3. Hallazgos

### A4-1 · El zorro puede volverse imposible de capturar por reclamación sin quedar «sin conexión»

**Severidad propuesta:** P1. Rompe en la práctica «captura del zorro → ganan cazadores». Si el propietario lo considera trampa explotable, P0. **Confianza:** alta, en el código.

**Descripción.** La captura validada exige una lectura del zorro de 15 s o menos y una precisión de 30 m o mejor (`engine.ts:836-838`). Nada obliga al zorro a enviar lecturas, y el periodo de gracia mide señales de la aplicación, no del GPS (`hub.ts:410-412`, `hub.ts:657-665`).

**Variantes:**
- **A) Deja de enviar ubicación.** Retira el permiso, apaga el GPS o bloquea la pantalla en el navegador. La aplicación sigue viva (ping cada 10 s).
  - nunca pasa a «sin conexión»;
  - cada reclamación da `target_location_stale`;
  - la pista muestra una posición cada vez más antigua (correcto);
  - gana por tiempo.
- **Variante con corte de red:** si está cerca del final, corta la red menos de 5 min y gana por tiempo, porque el final va antes (D-057).
- **B) Precisión de más de 30 m.** Por interiores, o con un valor manipulado: el servidor se fía de `acc` (`hub.ts:643`). Resultado:
  - `accuracy_too_low`;
  - con una precisión grande, `isOutsideZone(last, last.accuracyM, …)` (`engine.ts:516`) no lo da por fuera, así que no hay exposición.
- **C) No responder.** Cada reclamación bloquea las demás durante 30 s (`already_pending`, `engine.ts:831`) y caduca sin efecto:
  - `claim_expiry` no suma a `rejectedTagCount` (`engine.ts:276-284`);
  - los rechazos explícitos sí suman, pero la marca `repeated_tag_rejections` no se muestra en ninguna parte del cliente (no hay ningún uso de `flags` en `mobile/www/js`);
  - ya está documentado como «detección pasiva» en `QA/DECISIONES_PENDIENTES.md:11` y en D-035, pendiente.
- **D) Reclamación válida en los últimos 30 s.** Si el zorro no contesta:
  - `game_end` (prioridad 0) va antes que la caducidad;
  - `finish` borra las reclamaciones (`engine.ts:367`);
  - gana el zorro, y su «Sí» posterior da `claim_not_found`.
- **Posición falsa.** Dos lecturas falsas seguidas y coherentes «confirman» un salto (`location.ts:69-78`). En el navegador no hay `isMock`.

**Clásico tiene lo mismo**, pero en este modo decide toda la partida una sola persona.

**Reproducción:** `repro-a4-1-zorro-incapturable.mjs`. Resultado esperado hoy:
- A: `target_location_stale`, `f.away=false` y `{winner:'runner', cause:'time_up'}`;
- B: `accuracy_too_low` y `exposed=false`;
- C: 3 caducidades, `rejectedTagCount 0` y `flags []`;
- D: `time_up` y `claim_not_found`.

**Relación con D-035:** se cruza con D-035 (disputas, pendiente). Ver las cuestiones **D3** y **D4**.

### A4-2 · Quien sale en la cuenta atrás (p. ej., el zorro sorteado) aparece en el informe de la partida siguiente y es invitado a la revancha

**Severidad propuesta:** P2 (informe oficial incorrecto, el ganador no cambia). Si el informe cuenta como resultado, P1. **Confianza:** alta, por lectura del código.

**Evidencia:**
- En COUNTDOWN, `removePlayer` deja `leftRoom=false` (`engine.ts:909`, solo LOBBY y FINISHED) y no borra `team` ni `playedGameNo`.
- `backToLobby` solo reinicia a los `active` (`engine.ts:416-423`). `gameNo` no cambia.
- En la partida siguiente:
  - `snapshotFor` incluye en FINISHED a los `left` con `playedGameNo === gameNo` (`view.ts:186`);
  - `teamVisibleTo` le da su equipo del sorteo abortado (`view.ts:150`);
  - `reportParticipants` lo cuenta (`game-view.js:275`) y aparece en el grupo «Zorro» como «Abandonó» (`app.js:1039`).
- En la revancha, `eligible` (`engine.ts:950`) lo invita.
- Ya estaba anotado como «Invitado» fantasma tras abandonar a mitad de partida (`QA/ciclo-20261030-simulacion/INFORME_CICLO.md`, tabla). Esto es distinto: es un jugador que **no jugó** esa partida.
- La sesión sigue siendo válida en el servidor (`hub.ts:707`, porque solo se borra con `leftRoom`).

**Reproducción:** `repro-a4-2-fantasma-cuenta-atras.mjs`. Esperado hoy:
- «FALLO»;
- el grupo «Zorro» con 2 entradas: el zorro real y `f (Abandonó)`;
- `f` en la revancha como `invited`.

**Por qué afecta sobre todo a este modo:** que salga el zorro en la cuenta atrás es una de las salidas del modo a la sala.

### A4-3 · `set_team_pref` no está en la interfaz, pero el servidor lo acepta, y el anfitrión no puede verlo

**Severidad propuesta:** P2. Es una manipulación del reparto y un bloqueo sin diagnóstico; exige enviar el comando a mano. **Confianza:** alta.

**Evidencia:**
- `engine.ts:591-599`: cualquier jugador de la sala.
- La preferencia solo la ve quien la fija (`view.ts:192`).
- El cliente no envía nunca `set_team_pref` (`app.js:1224` solo `assign_team`).

**Efectos en `fox_hunt`:**
1. Un jugador se garantiza ser el zorro, salvo que el anfitrión lo asigne a otro rol. La regla dice «por sorteo o asignado por el anfitrión».
2. Dos jugadores con `runner`, o todos con `hunter` (por ejemplo, alguien que fuerza `hunter` cuando el anfitrión ya dejó los demás en «Cazador»), dan `teams_unbalanced/fox_hunt`. El anfitrión ve «revisa los roles asignados a mano» (`game-view.js:99`), pero todos sus selectores dicen «Sorteo».

**Cómo se hace:** en el navegador basta con abrir otro WebSocket con la sesión de `localStorage` (`outrun.session`).

**Reproducción:** `repro-a4-3-autoeleccion-zorro.mjs`. Esperado hoy:
- (1) zorro `[a]`, con `teamPref null` en la vista del anfitrión;
- (2) `{ok:false, error:'teams_unbalanced', detail:'fox_hunt'}`.

### A4-4 · Los jugadores «sin conexión» siguen saliendo con su posición

**Severidad propuesta:** P3 / ambigüedad. **Confianza:** alta, en el comportamiento.

**Comportamiento:**
- `away` no cambia `status` (`engine.ts:303-309`), y `visiblePositions` solo filtra `status !== 'active'` (`view.ts:73`).
- El zorro sigue recibiendo `hunter_seen` del cazador «sin conexión», con su última posición y antigüedad. El mapa la marca como desactualizada (`game-view.js:460`).
- La pista sigue mostrando la última posición del zorro «sin conexión», con su antigüedad.

**Choque de textos:**
- D-057 §1 dice «todos ven al jugador "sin conexión", sin equipo, posición ni hora». El comentario de `engine.ts:307` lo lee como el contenido del aviso.
- D-057 §3 dice «el zorro ve en directo a los cazadores **activos**».

No elijo interpretación: es la cuestión **D5**.

**Reproducción:** `repro-a4-4-sin-conexion-y-anfitrion.mjs` (a). Esperado:
- `h2.away=true`;
- el zorro recibe `h2` con `hunter_seen`, posición, unos 40 s y STALE;
- la pista con `f` «sin conexión» trae posición y antigüedad de unos 160 s (UNAVAILABLE).

### A4-5 · El anfitrión, que puede ser el zorro, puede anular la partida en cualquier momento

**Severidad propuesta:** P2 (diseño). **Confianza:** alta.

**Evidencia:** `end_game` (`engine.ts:663-667`) da `{winner:null, cause:'ended_by_host'}` y borra las reclamaciones.
- Si el anfitrión es el zorro, evita la derrota con una reclamación pendiente contra él.
- Si el anfitrión es cazador, puede negar la victoria al zorro segundos antes del final.

En Clásico el anfitrión también juega, pero aquí la decisión es de uno contra todos.

**Reproducción:** `repro-a4-4-sin-conexion-y-anfitrion.mjs` (b). Esperado: `ended_by_host`.

**Relacionado** (conforme a la regla, pero explotable): el zorro que recibe una reclamación puede pulsar «Abandonar» y la partida queda sin ganador (`withdraw`, que cancela la reclamación en `engine.ts:910-915`). Ver la cuestión **D6**.

### A4-6 · La autodeclaración del zorro atribuye la captura a cualquier cazador activo, sin comprobar la distancia

**Severidad propuesta:** P3. **Confianza:** alta.

**Evidencia:** `engine.ts:722-727`. El informe dirá «atrapado por X» (`game-view.js:213`) aunque X estuviera a 1 km. No cambia el ganador. Solo da crédito.

### A4-7 · Quien queda fuera por el periodo de gracia recibe, al reanudar, pistas anteriores con la posición del zorro

**Severidad propuesta:** P3 (privacidad menor). **Confianza:** media-alta.

**Evidencia:**
- Las pistas emitidas mientras era cazador activo siguen en su buzón con `containsLocation` hasta FINISHED (`hub.ts:719-730`).
- `resume` las repite si `lastSeq` está dentro del buzón (`hub.ts:504-509`).
- La interfaz no las dibuja (pantalla «Estás fuera», `app.js:877`) y no avisa porque son antiguas (`isStaleEvent`). Pero los datos llegan al dispositivo de alguien que ya no juega.

**Ejemplo:**
1. El cazador H se desconecta.
2. Llega la pista 2.
3. H queda fuera a los 5 min.
4. H reanuda la sesión: recibe la pista 2 con la posición del zorro.

### A4-8 · El mapa del zorro conserva hasta 5 s a un cazador que ya ha salido

**Severidad propuesta:** P3. **Confianza:** alta.

**Evidencia:** `mapModel` dibuja `ui.positions` sin cruzarlo con el estado de la instantánea (`game-view.js:446-462`). Se corrige en el siguiente `positions` (`hub.ts:797-802`).

### A4-9 · Textos y bordes menores del informe y de la pista

**Severidad propuesta:** P3. **Confianza:** alta.

- `hunters_abandoned` en este modo dice «Los cazadores abandonaron» (`game-view.js:111`), aunque hayan quedado fuera por falta de conexión. Para el zorro sí se distingue (`game-view.js:105`).
- `personalResult` dice al zorro «Tu equipo gana/pierde» (`game-view.js:309`), aunque juega solo.
- La pista usa `latestSample` aunque la lectura esté marcada como `jump` (`engine.ts:333`). Un salto aislado del GPS del zorro puede llegar a los cazadores como «posición exacta». Lo mismo pasa con el directo del zorro y la exposición.

## 4. Cuestiones de diseño pendientes (sin resolver)

1. **D1:** con menos de 3 jugadores en la huida o la persecución (por ejemplo, zorro contra 1 cazador tras abandonos), ¿se sigue jugando? La regla solo habla de la cuenta atrás, y el código sigue.
2. **D2:** si se van todos los cazadores, la regla común da «sin ganador» (D-057 §1). ¿Debería ganar el zorro? §11.3 solo trata el abandono del zorro.
3. **D3:** una reclamación válida pendiente al llegar el final: ¿cuenta, caduca o espera una ventana? (D-035 §9.3, pendiente). En este modo decide la partida.
4. **D4:** ¿qué pasa si el zorro no tiene lectura válida (sin GPS, precisión de más de 30 m) durante la persecución? ¿Exposición forzosa, «sin conexión» por GPS, aviso a los cazadores, o que la autodeclaración honesta sea la única vía? ¿Se muestran las marcas antitrampas o la «no respuesta» en el informe?
5. **D5:** un cazador «sin conexión», ¿es «activo» para el directo del zorro? ¿Y la pista de un zorro «sin conexión» debe llevar su posición? D-057 §1 («sin equipo, posición ni hora») frente a §3 («cazadores activos») y §11.1 («pistas con antigüedad real»).
6. **D6:** abandonar con una reclamación pendiente da «sin ganador». Es conforme a la regla, pero permite evitar la derrota. ¿Se acepta?
7. **D7:** ¿el anfitrión puede terminar sin ganador cuando él mismo es el zorro o un cazador? (A4-5)
8. **D8:** «Por sorteo o asignado por el anfitrión»: ¿se permite que el propio jugador elija su rol (protocolo actual) o solo el anfitrión? (A4-3)
9. **D9:** «En directo» hoy significa cada 5 s, con la lectura de hasta 15 s de antigüedad que la aplicación envía. ¿Es suficiente o hay que fijar una frecuencia mínima?

## 5. Escenarios para el coordinador

### 5.1 Simulador de 10 jugadores (`sim/panel/simulacion.mjs`, API `Simulation`)

Usar `new Simulation({ seed }).open()`, `start('fox_hunt')` y `advance(ms)`, igual que `sim/panel/test/simulacion.test.mjs`. Cada escenario con 3 semillas.

| Id | Escenario | Pasos | Resultado esperado |
|---|---|---|---|
| S1 | Partida completa | `start('fox_hunt')`; `advance` hasta FINISHED (≤ 25 min) | - 1 fugitivo y 9 cazadores.<br>- Un solo `game_finished` en `s.log`.<br>- Si gana `hunter`, el zorro está `captured` y `captures.length===1`.<br>- Si gana `runner`, es `time_up`. |
| S2 | Filtro continuo | Durante ACTIVE, cada 5 s: `s.state(n).view.positions` para los 10 | - Zorro: solo `hunter_seen`, 9 entradas (menos los que hayan salido).<br>- Cazador: `teammate` (8) y, como mucho, `exposed` del zorro.<br>- Nunca `hunter_seen` en un cazador. |
| S3 | Pistas | Tras cada pista: `s.state().lastPing` | - Una entrada (el zorro), con su antigüedad.<br>- Ningún mensaje `ping` en la conexión del zorro (`avatar(zorro).conn`: mirar los eventos que llegan). |
| S4 | Zorro desconectado y vuelve | `disconnect(zorro)` a 1 min de persecución; `advance(35s)`; `restore`; `advance(1 min)` | - `away=true` y aviso a todos.<br>- La pista sigue con su posición antigua (A4-4).<br>- Al restaurar, `away=false` y la partida sigue. |
| S5 | Zorro fuera por el periodo de gracia | `disconnect(zorro)`; `advance(5 min 10 s)` | `{winner:null, cause:'runners_abandoned'}` y `leftReason 'timeout'`. Si coincide con el final, `time_up` va antes. |
| S6 | Zorro congelado | `freeze(zorro)`; `advance(40s)`; `restore` | `away=true` con `connected=true`; vuelve. |
| S7 | **Zorro sin GPS con la aplicación viva (A4-1A)** | `prepareHuman(zorro)` sin abrir la interfaz: el bot deja de enviar lecturas y el socket sigue dando señal. Después, `validCapture(cazador, zorro)` | `target_location_stale` en el registro, `away=false` y, al final, `time_up` / `runner`. |
| S8 | Captura válida | `validCapture(undefined, zorro)` | `all_captured`, un `game_finished`, «Zorro atrapado». Un `claim_tag` posterior da `wrong_phase`. |
| S9 | Captura simultánea | `validCapture('AVATAR_02', zorro)` y `validCapture('AVATAR_03', zorro)` en el mismo paso | Una reclamación `ok` y la otra `already_pending`; una captura y un final. |
| S10 | Captura inválida | `invalidCapture()` | `not_close_enough`, sigue ACTIVE. |
| S11 | Cazador «sin conexión» y fuera | `disconnect(cazador)`; `advance(40s)`; mirar la vista del zorro; `advance(5 min)` | - Antes de 5 min, el zorro lo ve en `hunter_seen` con antigüedad creciente (A4-4).<br>- Después desaparece.<br>- La partida sigue con 8. |
| S12 | Todos los cazadores fuera | `disconnect` de los 9 cazadores (si el anfitrión es cazador, incluido); `advance(5 min 10 s)` | `hunters_abandoned`, sin ganador. |
| S13 | Pestaña duplicada del zorro | `duplicate(zorro)` | 4001 en el registro, sin `away`; el zorro sigue recibiendo `hunter_seen`. |
| S14 | Final por el anfitrión | `finish()` (anotar si AVATAR_01 es el zorro) | `ended_by_host`. |
| S15 | Sale el zorro en la cuenta atrás (A4-2) | Tras `start`, `avatar(zorro).command({type:'leave'})` dentro de los 5 s (reloj a ×1); luego empezar de nuevo con los 9 (hace falta un ayudante que vuelva a hacer `set_ready` y `start`) | Vuelta a la sala. En el informe de la partida siguiente **no** debería estar el que salió. Hoy aparece: A4-2. |

### 5.2 Tamaño mínimo (3–4 jugadores)

El simulador tiene 10 fijos. Usar el arnés del motor (`engine/test/helpers.ts`) o servidor con clientes (`server/test/helpers.mjs`: `testServer`, `room`, `player`), igual que `server/test/fox-hunt.test.mjs`.

| Id | Jugadores | Escenario | Esperado |
|---|---|---|---|
| M1 | 3 | Sorteo sin asignaciones, 20 semillas (`seed` del `Harness`) | Siempre 1 zorro; al menos 2 zorros distintos en las 20. |
| M2 | 3 | Sale un cazador en la cuenta atrás | Vuelve a la sala (`countdown_aborted`, `team_empty`). |
| M3 | 4 | Sale un cazador en la cuenta atrás | Sigue con 3. Sin prueba hoy. |
| M4 | 4 | Sale el zorro en la cuenta atrás y luego se juega con 3 | Vuelve a la sala. El informe siguiente lista 1 zorro (hoy falla: `repro-a4-2-fantasma-cuenta-atras.mjs`). |
| M5 | 3 | Sale un cazador en la persecución | Sigue 1 contra 1 (D1). |
| M6 | 3 | Salen los 2 cazadores | `hunters_abandoned`. |
| M7 | 3 | Zorro sin GPS, aplicación viva | Ver `repro-a4-1-zorro-incapturable.mjs` (A–D). |
| M8 | 4 | Autoelección y bloqueo | `repro-a4-3-autoeleccion-zorro.mjs` |
| M9 | 3 | Cazador y zorro «sin conexión»; el anfitrión zorro termina | `repro-a4-4-sin-conexion-y-anfitrion.mjs` |
| M10 | 3 | Revancha 5 veces seguidas con `swapRoles` true y false | Siempre 1 zorro; ningún `teamPref` arrastrado (`teamPrefSetBy null`). |
| M11 | 3 (servidor) | El cazador H se desconecta, llega una pista, H queda fuera y reanuda con su `lastSeq` antiguo | Hoy H recibe en crudo el evento `ping` con la posición del zorro (A4-7). |
| M12 | 3 (servidor) | El zorro acepta la reclamación en el mismo milisegundo que `gameEnd` | Un solo `game_finished`, con `time_up` (el plazo va antes). |

### 5.3 Validación física (3–4 móviles reales)

1. **F1 · Sorteo y roles.** Sala de 3 con sorteo:
   - la tarjeta «ZORRO» solo al terminar la cuenta atrás;
   - después, todos ven quién es;
   - foto de las tres pantallas.
2. **F2 · Retraso del directo.** Un cazador camina 100 m en línea recta. Medir el retraso con que el zorro lo ve: se espera de 5 a 10 s.
3. **F3 · Pista.** Comparar la posición recibida con la real del zorro en el momento de la pista. La antigüedad mostrada debe cuadrar con el reloj.
4. **F4 · Interiores (A4-1B).** El zorro entra en un portal o un centro comercial. Anotar la precisión y si la reclamación devuelve `accuracy_too_low`.
5. **F5 · Pantalla bloqueada en el navegador (A4-1A).** El zorro bloquea la pantalla 2 min. Comprobar:
   - que no aparece «sin conexión» mientras el socket siga vivo, o que sí aparece si el navegador congela la página;
   - que las reclamaciones dan «lectura antigua».

   Repetir con la app nativa, cuyo servicio sigue enviando.
6. **F6 · Fuera de zona.** El zorro sale de la zona 40 s y vuelve. Los cazadores lo ven en directo y deja de verse al volver.
7. **F7 · Captura real.** Captura a unos 5 m con confirmación. El informe debe ser idéntico en los 3 móviles y decir «Zorro atrapado».
8. **F8 · Modo avión.** Un cazador activa el modo avión 45 s:
   - el zorro ve el aviso «sin conexión» y el punto desactualizado;
   - al volver, «ha vuelto».
9. **F9 · Salida en la cuenta atrás (A4-2).** El zorro pulsa «Abandonar» en la cuenta atrás. Se juega con los demás y se revisa el informe.
10. **F10 · Revancha.** Dos revanchas: anotar quién sale de zorro.
11. **F11 · Anfitrión zorro.** El zorro es el anfitrión y termina la partida con una reclamación pendiente (A4-5).

## 6. Archivos de reproducción (no ejecutados)

Todos en `C:\Users\aange\AppData\Local\Temp\claude\C--Users-aange\e108e3b2-532d-48d6-89f2-6b46f764d244\scratchpad\agente4\`. Se ejecutan con Node 24 (quita los tipos de los `.ts`): `node <archivo>`.

- `repro-a4-1-zorro-incapturable.mjs`: corresponde a A4-1.
- `repro-a4-2-fantasma-cuenta-atras.mjs`: corresponde a A4-2.
- `repro-a4-3-autoeleccion-zorro.mjs`: corresponde a A4-3.
- `repro-a4-4-sin-conexion-y-anfitrion.mjs`: corresponde a A4-4 y A4-5.

