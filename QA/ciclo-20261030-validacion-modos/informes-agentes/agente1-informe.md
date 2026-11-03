# Informe del Agente 1: motor y reglas (THE OUTRUN)

Auditoría de solo lectura. No he ejecutado nada. Script de reproducción, sin ejecutar: `C:\Users\aange\AppData\Local\Temp\claude\C--Users-aange\e108e3b2-532d-48d6-89f2-6b46f764d244\scratchpad\agente1\repro-agente1.ts`

## 1. Archivos examinados
- `engine/src/engine.ts` (completo), `modes.ts`, `teams.ts`, `view.ts`, `validate.ts`, `config.ts`, `location.ts`, `constants.ts`, `types.ts`.
- `engine/test/helpers.ts`, `infection.test.ts` (completo), `fox-hunt.test.ts` (parcial: títulos y reparto), y los títulos de `presence.test.ts`.
- `docs/product/GAME_MODES_AND_RULES.md` (completo), `DECISION_LOG.md` (D-056 y D-057), `ACCEPTANCE_CRITERIA.md` (AC-I, AC-J y AC-C8), `docs/technical/GAME_STATE_MACHINE.md` §9.
- `server/hub.ts`: solo las partes de las señales de vida y del reparto de eventos (`receive`, `seen`, `run`, `commit` y la lista blanca de comandos).
- `mobile/www/js/app.js`: solo los usos de `canTagFrom` y `assign_team`.
- `git diff -w HEAD -- engine` (sin cambios de espacios) para separar lo nuevo de lo heredado.

## 2. Reglas verificadas leyendo el código

**Comunes**
- `rulesVersion` por modo:
  - Clásico: `clasico/2026-10-30` (constants.ts:27, modes.ts:30);
  - Infección: `infeccion/2026-10-30` (modes.ts:44);
  - Caza del zorro: `zorro/2026-10-30` (modes.ts:58).
  - Se fija al empezar (engine.ts:814).
- Sin modo, se juega Clásico (modes.ts:72-75); un modo desconocido se rechaza (config.ts:12).
- El modo solo cambia en LOBBY (engine.ts:622-624), así que las reglas quedan congeladas al empezar (§1.2).
- Presencia:
  - «sin conexión» a los 30 s y fuera de la partida a los 5 min, en HEAD_START y ACTIVE (engine.ts:175-182, 303-316; constants.ts:49-52);
  - el capturado (espectador) no queda fuera (`status !== 'active'`, engine.ts:178);
  - si el final por tiempo coincide con el plazo de 5 min, gana el final (prioridad 0 frente a 4, engine.ts:195 y 180);
  - quedar fuera tiene las mismas consecuencias que abandonar (`withdraw`, engine.ts:923-929): se cancelan sus reclamaciones (910-915), sale de la última pista (908), se traspasa el anfitrión y se comprueba el final.
- Un comando rechazado no deja rastro: se restaura la copia tomada después de procesar los plazos (engine.ts:552-563).
- Orden dentro de un paso:
  - todos los plazos vencidos se procesan antes del comando (engine.ts:550);
  - a la misma hora, el orden es fin > caducidad de reclamación > exposición > pista > presencia (prioridades en dueList).
  - Consecuencias: una confirmación que llega exactamente a la hora de caducidad se rechaza (`claim_not_found`), y una que llega exactamente a `gameEnd` también (las reclamaciones ya se borraron en `finish`, engine.ts:367).
- Revancha: sorteo nuevo (`teamPref = 'random'`, engine.ts:962-963). Con un número exacto de cazadores (Infección, Caza del zorro), `swapRoles` también da sorteo (engine.ts:962). La semilla cambia porque usa `seed + gameNo` (engine.ts:778, 936).
- Toda partida termina:
  - ACTIVE siempre tiene `gameEnd` (engine.ts:267), y el plazo `game_end` siempre está en la lista (195);
  - no he encontrado ninguna secuencia que deje una partida activa sin final.

**Infección**
- Mínimo de 4 (modes.ts:45; engine.ts:775).
- Cazadores iniciales `max(1, floor(n/4))` exactos, también con asignación manual (modes.ts:46-47; teams.ts:30, 55). He comprobado a mano los casos n=4..20 (4-7→1, 8-11→2, 12-15→3, 16-19→4, 20→5). El script A1-7 lo comprueba con 50 semillas.
- Conversión en el mismo paso (engine.ts:454-456, 473-486):
  - `team='hunter'` y sigue activo; se borran sus muestras y su exposición; sale de la última pista;
  - se fijan `canTagFrom = now + 60 s` y `pingsBeforeConversion`;
  - se emiten `runner_captured` (a todos, con `converted: true`) y `role_changed` (solo a él);
  - se comprueba el final.
  - No puede quedar con doble rol porque `team` es un único campo, y `self_tag` de un convertido da `not_a_runner` (engine.ts:710).
- Reclamaciones pendientes al convertirse:
  - la reclamación contra él se consume antes de convertirlo (engine.ts:688, 713-721);
  - un fugitivo no puede tener reclamaciones propias, y `pendingClaimFor` impide que haya más de una por fugitivo (engine.ts:831);
  - las reclamaciones sobre otros fugitivos siguen vivas (hay prueba).
- Espera de 60 s:
  - `now < canTagFrom` da `tag_cooldown` (engine.ts:826); en el límite exacto, 59.999 s se rechaza y 60.000 s se acepta;
  - la atribución de una autodeclaración usa el mismo criterio (engine.ts:725), y la vista también (`canTagFrom > now`, view.ts:208): las tres usan la misma referencia de tiempo del servidor;
  - ni la reconexión ni el «sin conexión» la cambian (`markSeen` no toca `canTagFrom`, engine.ts:354-360). Solo se reinicia en `start` (engine.ts:797-799).
- Un rechazo nunca convierte (engine.ts:695-704).
- Pistas:
  - la pista va a los cazadores activos en ese instante (engine.ts:345), y siempre se procesa antes del comando del mismo paso, así que el convertido no la recibe;
  - la instantánea oculta la última pista anterior a su conversión (view.ts:164-165).
- Visibilidad después de convertirse: ve a los cazadores como compañeros y deja de ver a los fugitivos (view.ts:74-75). Los fugitivos no lo ven (`runnersSeeHunters` es false).
- Finales:
  - todos convertidos: `all_captured` con victoria de los cazadores (engine.ts:430-434);
  - tiempo agotado con supervivientes: ganan los fugitivos (engine.ts:274);
  - abandono o periodo de gracia del último fugitivo: `runners_abandoned`;
  - sin cazadores: `hunters_abandoned`. **Los convertidos cuentan como cazadores**, porque `activeOf(s,'hunter')` filtra por `team` y `status` (engine.ts:48-49, 437). Coincide con §3.6: «iniciales y convertidos se han ido».

**Caza del zorro**
- Mínimo de 3. Exactamente un zorro por sorteo o por asignación; si no cuadra, `teams_unbalanced` (modes.ts:59-61; teams.ts:44-55).
- En la cuenta atrás:
  - si quedan menos de 3, o sin zorro, o sin cazadores, se vuelve a la sala (engine.ts:889-893);
  - los roles no se ven (view.ts:151) y se hacen públicos después (view.ts:156).
- El zorro ve a los cazadores activos en directo desde la huida, porque HEAD_START cuenta como fase en directo (view.ts:59, 83-84). Los cazadores se ven entre sí (view.ts:74).
- La pista lleva solo a los fugitivos activos, es decir, al zorro, con su posición exacta, su precisión y su antigüedad (engine.ts:332-341). No hay ningún otro camino por el que se filtren posiciones: el zorro no recibe ni `ping` ni `lastPing`.
- Una captura válida termina la partida una sola vez:
  - `checkEnd` llama a `finish`;
  - después, `self_tag`/`claim_tag` dan `wrong_phase` y `respond_tag` da `claim_not_found`, porque las reclamaciones se vaciaron.
- Una captura inválida no cambia el estado (se restaura la copia). Un rechazo solo incrementa `rejectedTagCount`.
- Si el zorro abandona o queda fuera por el periodo de gracia, la partida termina sin ganador (`runners_abandoned`). No he encontrado ninguna victoria no aprobada **dentro de los 5 min** (ver A1-3).

**Clásico** (sin cambios de comportamiento, salvo los aprobados)
- Comparado con HEAD, sin espacios:
  - todas las ramas nuevas pasan por `modeOf(config)`, y para Clásico sus valores no cambian nada (`canTagFrom=null`, `convertTagDelayMs=0`, `runnersSeeHunters=false`, `exactHunters=false`, `hunters` igual que el `targetHunters` anterior);
  - en la cuenta atrás, `active < 2` está implícito en «equipo vacío».
- Cambios en Clásico, todos respaldados por una decisión:
  - revancha con sorteo (D-056);
  - el capturado sale de `lastPing` (D-056);
  - periodo de gracia (D-057);
  - equipos visibles en FINISHED (D-056);
  - `not_enough_players` lleva ahora `detail:'classic'`: es un cambio en la forma de la respuesta, no en la regla.

## 3. Reglas no verificadas
- «Informe: cadena de contagio, último superviviente, "Te infectó X…; después infectaste a N"». El motor solo entrega `captures[]` con `hunterId`, `converted` y `atOffsetMs`. El cálculo lo hace el cliente, y no lo he revisado.
- La tarjeta y el aviso al convertido (texto de la interfaz).
- La deduplicación por `commandId` (en el servidor) y el reinicio de los plazos tras una suspensión (`checkSuspended`).
- El filtrado de posiciones en la capa de red (`visiblePositions` se usa en el servidor; no he revisado su llamada).
- No he ejecutado ninguna prueba: todo lo marcado como «confirmado» lo está por lectura.

## 4. Hallazgos

### A1-1 · Infección y Caza del zorro · Un jugador puede elegir su propio rol (o bloquear el inicio) con `set_team_pref`
- **Descripción:** §11.3 dice: «un único zorro, por sorteo o asignado por el anfitrión». §4.4: «El anfitrión asigna». Sin embargo, el motor acepta `set_team_pref` de cualquier jugador en LOBBY (engine.ts:591-599), y `resolveTeams` respeta esas preferencias por encima del sorteo (teams.ts:17-27). La interfaz solo usa `assign_team` (app.js:1224), pero el servidor deja pasar `set_team_pref` (hub.ts:543 solo bloquea join, connection, seen y location).
- **Consecuencias:**
  - un cliente modificado se garantiza ser el zorro, o cazador inicial en Infección;
  - dos jugadores que se piden «fugitivo» en Caza del zorro (o demasiados «cazador» en Infección) bloquean el inicio con `teams_unbalanced`;
  - el anfitrión no ve esas preferencias (`teamPrefSetBy` es el propio jugador; view.ts:192) y no sabe por qué no empieza;
  - además, un `set_team_pref` del jugador sobrescribe en silencio una asignación del anfitrión.
- **Reproducción:** escenarios A1-1a, b y c del script.
- **Severidad propuesta:** P2 (trampa que exige un cliente modificado; en Clásico es comportamiento heredado de S0).
- **Confianza:** confirmado por lectura.

### A1-2 · Clásico → Infección/Caza del zorro · Preferencias ocultas arrastradas por `swapRoles` bloquean el inicio
- **Descripción:**
  - una revancha de Clásico con `swapRoles:true` fija `teamPref` a hunter/runner con `teamPrefSetBy=null` (engine.ts:962-965);
  - `configure` no reinicia las preferencias (engine.ts:622-631);
  - si el anfitrión cambia a Infección, el número de cazadores fijado (≈3n/4) no cuadra, y `start` da `teams_unbalanced`;
  - nadie ve esas preferencias, porque `teamPref` es null para todos en la instantánea.
- **Atenuante:** según D-056, la interfaz no usa `swapRoles`.
- **Reproducción:** escenario A1-2. Resultado esperado: `{"ok":false,"error":"teams_unbalanced","detail":"infection"}`, con todas las preferencias en null.
- **Severidad propuesta:** P3.
- **Confianza:** confirmado por lectura.

### A1-3 · Caza del zorro (y Clásico/Infección) · El fugitivo puede «desaparecer» los últimos 5 min y ganar por tiempo
- **Descripción:**
  - mientras está «sin conexión», el fugitivo no es capturable, porque `claimTag` exige una muestra suya de menos de 15 s (engine.ts:837);
  - si deja de dar señales menos de 5 min antes del final, `game_end` llega antes que `absence_timeout`, y gana (engine.ts:274);
  - en Caza del zorro, un solo jugador decide el resultado.
- **Valoración:** es conforme a la letra de D-057 («a los 5 min queda fuera»; «si el final por tiempo coincide, el final va antes»). Lo informo como riesgo de la regla, sin elegir interpretación.
- **Reproducción:** escenario A1-4. Resultado esperado: `{"winner":"runner","cause":"time_up"}`, con el zorro 4 min sin señal.
- **Severidad propuesta:** P2 (riesgo de diseño, no defecto de código).
- **Confianza:** confirmado por lectura.

### A1-4 · Caza del zorro · Un zorro que no confirma nunca puede no ser capturado jamás
- **Descripción:**
  - la captura exige confirmación (o autodeclaración);
  - las reclamaciones sin respuesta caducan a los 30 s sin captura (engine.ts:276-284);
  - solo puede haber una reclamación pendiente por fugitivo (engine.ts:831), así que con un único zorro todos los cazadores juntos pueden hacer como mucho una reclamación cada 30 s;
  - el procedimiento de disputa de D-035 (§9.3) no está implementado; solo se marca `repeated_tag_rejections`.
- **Valoración:** es heredado de Clásico (§11.1: «captura por reclamación con confirmación»), pero en uno contra todos el efecto es mayor.
- **Severidad propuesta:** P2 (riesgo de diseño).
- **Confianza:** confirmado por lectura.

### A1-5 · Todos los modos · Si todos quedan fuera a la vez, la causa depende del orden alfabético de los ids
- **Descripción:**
  - los plazos `absence_timeout` con la misma hora y prioridad se ordenan por `ref` (engine.ts:226);
  - si el primero en salir es el último fugitivo, la causa es `runners_abandoned`; si es el último cazador, `hunters_abandoned`;
  - en los dos casos no hay ganador, pero el texto del informe cambia de forma arbitraria. El caso es AC-C8 con D-057.
- **Reproducción:** escenario A1-5 (fugitivo `a` → `runners_abandoned`; fugitivo `z` → `hunters_abandoned`).
- **Severidad propuesta:** P3.
- **Confianza:** confirmado por lectura.

### A1-6 · Infección · Diferencias entre la documentación y el código en eventos y códigos de error (documentos en borrador o propuestas)
- **Diferencias:**
  - AC-I1 y GAME_STATE_MACHINE §9.2 / reglas §3.2 piden el evento `runner_infected` con `captureId`. El código emite `runner_captured` con `converted:true`, sin `captureId` ni `infectedBy` (engine.ts:481-484).
  - AC-I3 pide `forbidden`/`transition_active`. El código da `tag_cooldown`, que sí coincide con §11.2, la regla aprobada.
  - §3.4 pide `already_captured` ante una segunda confirmación. El código da `not_a_runner` (self_tag) o `target_not_active` (claim_tag sobre un convertido, engine.ts:828).
- **Valoración:** §11 (aprobado) no exige estos nombres. La documentación anterior está en borrador o es propuesta. Lo dejo para quien decida qué documento manda.
- **Severidad propuesta:** P3.
- **Confianza:** confirmado por lectura.

### A1-7 · Infección · `canTagFrom` sigue en la instantánea después del final y en la sala de la revancha
- **Descripción:**
  - `snapshotFor` devuelve `canTagFrom` siempre que sea `> now`, sin mirar la fase (view.ts:208);
  - si la última conversión termina la partida («todos infectados»), el último convertido recibe en FINISHED, y en LOBBY tras una revancha rápida, un `canTagFrom` futuro hasta que `start` lo borra;
  - el cliente solo lo usa en `actions()` de la vista de juego (app.js:951-955), así que el efecto visible probablemente es nulo.
- **Severidad propuesta:** P3.
- **Confianza:** confirmado por lectura. El efecto en la interfaz es una suposición.

### A1-8 · Infección · Convertir a un fugitivo expuesto no avisa a los cazadores con `runner_unexposed`
- **Descripción:** `convert` llama a `clearLocationState`, que pone `exposed=false` (engine.ts:476, 80-86), pero no emite `runner_unexposed`, como sí hace `evaluateZone` (engine.ts:526-530). Si el cliente mantiene un marcador de «fugitivo fuera de la zona» basado en el evento, podría seguir mostrándolo hasta la siguiente instantánea. En Clásico pasa lo mismo con la captura, pero el capturado deja de estar activo.
- **Severidad propuesta:** P3.
- **Confianza:** el comportamiento del motor está confirmado. El efecto en el cliente es una sospecha.

### A1-9 · Infección · Reglas no especificadas en la cuenta atrás
- **Descripción:**
  - el código vuelve a la sala si en la cuenta atrás quedan menos de 4 jugadores (engine.ts:891). §11.2 solo lo dice para Caza del zorro;
  - si sale un fugitivo con n=8→7, la partida sigue con 2 cazadores, aunque `max(1, floor(7/4))=1`. §11.2 dice «exactos» sin precisar si es solo al empezar.
- **Valoración:** no elijo interpretación.
- **Severidad propuesta:** P3.
- **Confianza:** confirmado por lectura.

### A1-10 · Infección (y Clásico) · La autodeclaración atribuye la captura a cualquier cazador activo, sin comprobar cercanía
- **Descripción:** con `self_tag {hunterId}` sin reclamación pendiente, la captura se atribuye a cualquier cazador activo que no esté en su espera (engine.ts:722-727). Dos jugadores pueden inflar «después infectaste a N» en la cadena de contagio. Sin `hunterId`, la conversión queda con `hunterId:null`, y el informe tiene que tratar «Te infectó: desconocido».
- **Severidad propuesta:** P3.
- **Confianza:** confirmado por lectura.

### A1-11 · Todos (heredado) · Quien sale en la cuenta atrás queda como «fantasma» si la cuenta atrás se anula
- **Descripción:**
  - `removePlayer` en COUNTDOWN deja `status='left'` y `leftRoom=false` (engine.ts:909);
  - `backToLobby` solo devuelve a la sala a los activos (engine.ts:416-422);
  - el que salió no está en la sala, no puede volver a unirse (`already_joined`, engine.ts:755) y su sesión sigue viva hasta que vuelve a pulsar «Salir».
- **Valoración:** es heredado de Clásico, pero Caza del zorro e Infección añaden un disparador nuevo: la vuelta a la sala por el mínimo.
- **Severidad propuesta:** P3.
- **Confianza:** confirmado por lectura.

No he encontrado ningún P0 ni P1 en el motor.

## 5. Casos límite (comportamiento observado leyendo el código)
- **Espera:**
  - 59.999 s da `tag_cooldown`; 60.000 s se acepta (script A1-3);
  - la autodeclaración a los 59.999 s no se atribuye; a los 60.000 s sí.
- **Pista y conversión en el mismo paso:** la pista va primero y el convertido no la recibe.
- **Exposición y conversión en el mismo paso:** primero se envía `runner_exposed` a los cazadores; después se convierte sin `runner_unexposed` (A1-8).
- **Confirmación justo a la hora:** con `now = expiresAt` se rechaza (`claim_not_found`); con `now = gameEnd` también, porque el tiempo va primero.
- **«Sin conexión» y captura:** el servidor procesa `seen` antes del comando (hub.ts:412), y el fugitivo «sin conexión» no es capturable por reclamación, porque su muestra está caducada.
- **Plazo de 5 min y final por tiempo a la misma hora:** gana el final.
- **Todos fuera a la vez:** la causa depende del id (A1-5).
- **Infección:**
  - si se van todos los cazadores iniciales pero queda un convertido en su espera, la partida sigue (script A1-6);
  - si el último fugitivo abandona con una reclamación pendiente: `runners_abandoned`, sin ganador, y la reclamación se cancela.
- **Caza del zorro:** con cazadores que se van durante la partida se puede acabar jugando 1 contra 1, porque el mínimo solo se aplica en la cuenta atrás. La regla no dice nada de este caso.
- **Anfitrión:** el anfitrión que es zorro puede terminar la partida (`end_game`) cuando lo van a atrapar, y queda sin ganador. Es heredado (§2.2 en propuesta).

## 6. Pruebas unitarias que faltan
1. Límite exacto de la espera (`canTagFrom − 1` y `canTagFrom`) para `claim_tag` y para la atribución de `self_tag`.
2. Que la reconexión o el «sin conexión» durante la espera no cambien `canTagFrom`.
3. Infección `hunters_abandoned`:
   - si se van los cazadores iniciales con un convertido presente, la partida sigue;
   - si después se van todos, incluido el convertido, termina sin ganador.
4. Infección: el último fugitivo abandona o queda fuera → `runners_abandoned`.
5. Infección: n=4..20 completo (las pruebas solo cubren 4, 5, 7, 8, 9, 12 y 20) y la asignación manual exacta en el límite (n=8 con 2 a mano funciona; con 1 o 3, no).
6. Infección: que la cuenta atrás vuelva a la sala con menos de 4 jugadores, y la decisión sobre el número de cazadores si alguien sale en la cuenta atrás.
7. Caza del zorro:
   - el zorro ve a los cazadores ya en HEAD_START, no solo en ACTIVE;
   - la pista no incluye ninguna otra posición.
8. Caza del zorro: `set_team_pref` de un jugador no anfitrión, que decida si se rechaza o se permite (A1-1).
9. Captura y `game_end` a la misma hora (`respond_tag` con `now = gameEnd`).
10. Conversión de un fugitivo expuesto: qué eventos reciben los cazadores (A1-8).
11. Todos fuera a la vez: causa determinista y documentada (A1-5).
12. Clásico: una prueba de regresión que fije `rulesVersion`, `canTagFrom == null` y que la revancha con `swapRoles` siga intercambiando equipos.
