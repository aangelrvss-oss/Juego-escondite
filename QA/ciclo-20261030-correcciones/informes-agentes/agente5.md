# Agente 5 · Interfaz y experiencia de juego · correcciones C11–C18 y punto 4

Todo se ha hecho sin git que escriba, sin navegadores, sin e2e y sin servidores. Las pruebas se han ejecutado de una en una (`node --test --test-concurrency=1`) desde `mobile/`, comprobando antes la memoria libre (entre 423 y 896 MB).

Prueba nueva: `mobile/test/regresiones-ciclo.test.mjs`, con 16 casos.
- **ANTES** de corregir: 0 pasan y 16 fallan (salida real abajo).
- **DESPUÉS:** 16 pasan y 0 fallan.

## Por corrección

### C11 · V-09 · Caza del zorro: el cazador no sabía quién es el zorro
- **Causa:** el servidor ya da `team:'runner'` del zorro a los cazadores en la huida y la persecución (`view.ts` `teamVisibleTo`), pero la interfaz no lo usaba en ningún sitio.
- **Cambio:**
  - `game-view.js:470` `foxLine(snap, myId, nameOf)` devuelve «El zorro es X». Solo lo da a un cazador, solo en Caza del zorro y solo en HEAD_START o ACTIVE. Al zorro le devuelve null.
  - `app.js:927-928`: la línea bajo el reloj (`.callout`) queda como «El zorro es Zoe. Espera en la zona de salida…» o «El zorro es Zoe. Caza al zorro…».
  - `app.js:972-979`: en la leyenda, «Zorro (Zoe) fuera de la zona».
  - `app.js:1132-1144`: la tarjeta de rol del cazador incluye «El zorro es Zoe.» y «Todos saben quién es el zorro.».
  - El zorro no recibe nada nuevo.
- **Prueba:** «C11 · el cazador sabe quién es el zorro en la huida y la persecución».
  - ANTES: `expected 'function', actual 'undefined'`.
  - DESPUÉS: ok.
- **e2e** (`zorro.e2e.mjs`):
  - Beto ve «El zorro es Zoe» en la tarjeta y bajo el reloj durante la huida.
  - Zoe no ve esa línea.
  - Ana la ve en la persecución.
- **Modos:** Caza del zorro.

### C12 · V-08 · Infección: el informe perdía infecciones
- **Causa:** `contagionChains` solo seguía a la primera víctima de cada persona.
- **Cambio:**
  - `game-view.js:267` `contagionGroups(captures)` sustituye a `contagionChains`. Da `[{hunterId, victims}]` en orden temporal. Las infecciones sin autor (autodeclaradas) van en el grupo `hunterId:null`.
  - `missionReport` muestra una sola línea: «Contagio: Ana → Beto · Beto → Caro, Dani · Sin autor conocido → Eva · Eva → Fede».
- **Pruebas:**
  - «C12 · el informe de Infección muestra todas las infecciones…»: ANTES `actual 'Contagio: Ana → Beto → Caro'`, `expected 'Contagio: Ana → Beto · Beto → Caro, Dani'`.
  - «C12 · las infecciones autodeclaradas sin autor también aparecen…»: ANTES «Dani aparece en "Contagio: Ana → Beto → Caro"» daba false.
  - DESPUÉS: las dos ok.
- **Prueba que validaba un resultado erróneo:**
  - En `mobile/e2e/infeccion.e2e.mjs:174`, `assert.match(reports[0], /Contagio: Ana → Beto → Caro/)` daba por bueno un informe sin la infección de Dani por Beto (la propia e2e hace que Dani se autodeclare infectado por Beto). Fijaba el defecto en lugar de la regla («el informe muestra la cadena de contagio», D-057 §2).
  - Ahora exige `/Contagio: Ana → Beto · Beto → Caro, Dani/`, con un comentario que lo explica.
- **Ajuste de una prueba existente:** `mobile/test/modes.test.mjs` usaba `contagionChains`, con la misma semántica incompleta.
  - Pasa a `contagionGroups`, con dos grupos.
  - La línea del informe del caso «sobreviven» pasa a ser «Contagio: Ana → Beto · Beto → Caro».
- **Modos:** Infección.

### C13 · V-11 · Posiciones viejas tras un cambio de equipo o una salida
- **Causa:** `ui.positions` se conserva hasta el siguiente envío (cada 5 s), y `mapModel` pinta todo `teammate` con el equipo actual.
- **Cambio:**
  - `game-view.js` `mapModel` (bloque «La lista local es la del último envío…») descarta:
    - a quien no está en la vista o tiene estado `left`;
    - un `teammate` cuyo equipo en la vista actual no es el mío;
    - un `exposed` o `hunter_seen` que ya no está activo.
  - Solo filtra si la vista trae `players`.
  - `app.js:307`: en `role_changed`, `ui.positions = []`.
  - `app.js:315`: en `player_left`, se quita su posición.
- **Pruebas:**
  - «C13 · tras convertirse, las posiciones de los antiguos compañeros no se pintan como "Tu equipo"».
  - «C13 · quien sale de la partida desaparece del mapa…».
  - ANTES: `deepEqual` falla (salía el punto).
  - DESPUÉS: ok.
- **Ajuste:** en `mobile/test/map-view.test.mjs`, la vista de una prueba tenía `players: []` con una posición de `x`. Esa combinación no se da: el servidor lista siempre a quien juega. Se añaden `x` e `y` a la vista.
- **Modos:** Infección y Caza del zorro. En Clásico solo afecta a la salida de un jugador.

### C14 · V-12 · Tarjeta «Te han infectado» tras un evento viejo
- **Causa:** `role_changed` con `ageMs > 15 s` es «stale»: no salía ninguna tarjeta y la instantánea no se miraba.
- **Cambio:**
  - `game-view.js:428` `pendingConversion(snap, myId, seenKey)` da la clave `roomId:gameNo` si estoy activo como cazador en HEAD_START o ACTIVE, hay una captura `converted` sobre mí y no se ha visto ya.
  - `app.js:221-231` `showConversion` guarda la clave en `localStorage` (`outrun.converted`), muestra la tarjeta y la anuncia.
  - Se llama desde la instantánea (`app.js:198`) y desde `role_changed` en vivo (`app.js:301`). La primera que llega la muestra y la segunda no hace nada, así que no hay duplicados.
  - `game-view.js:438` `conversionText(canTagFrom, now)`: «Podrás capturar dentro de m:ss» con `canTagFrom` (antes era un «1 min» fijo), o «Ya puedes capturar».
- **Pruebas:**
  - «C14 · la tarjeta… se deduce de la instantánea si el evento llegó viejo».
  - «C14/C18 · el texto de la tarjeta usa la espera real».
  - ANTES: `undefined` / `gv.conversionText is not a function`.
  - DESPUÉS: ok.
- **Modos:** Infección.

### C15 · V-13 · La tarjeta de conversión tapaba el informe
- **Cambio:**
  - `game-view.js:444` `revealOpen(reveal, snap, nowPerf)`: la tarjeta solo se dibuja en HEAD_START o ACTIVE.
  - `app.js:1131` la usa.
  - `game_finished` pone `ui.reveal = null` (`app.js`, `case 'game_finished'`).
- **Prueba:** «C15 · la tarjeta… no se dibuja con la partida terminada».
  - ANTES: undefined.
  - DESPUÉS: ok.
- **e2e:** `infeccion.e2e.mjs` comprueba que no hay `.overlay.reveal` sobre el informe en ninguno de los cuatro.
- **Modos:** Infección. El de los demás modos ya caducaba a los 5 s.

### C16 · V-14 · `countdown_aborted` sin explicación
- **Cambio:**
  - `game-view.js:457` `countdownAbortText(reason)`. Con `team_empty`: «Se ha cancelado el inicio: alguien ha salido y faltan jugadores.». Con `aborted_by_host`: «El anfitrión ha cancelado el inicio.». Con cualquier otro motivo, un genérico. Siempre añade «Vuelve a pulsar «Estoy listo» para empezar otra vez.».
  - `app.js:400-406`: aviso (toast `danger`), anuncio a lectores de pantalla y aviso fijo en la sala (`ui.lobbyNotice`, `app.js:830`).
  - El aviso se quita al pulsar «Estoy listo» (`app.js:1356`), al salir de LOBBY o con `resetGame`.
  - El botón real se llama «Estoy listo», no «Listo».
- **Prueba:** «C16 · …».
  - ANTES: undefined.
  - DESPUÉS: ok.
- **Modos:** todos. Es visible sobre todo en la Caza del zorro y en Infección (mínimos de 3 y 4 jugadores).

### C17 · V-15 · «Tu partida» de quien quedó fuera por la conexión
- **Cambio:** en `game-view.js:318` `personalResult`, si `status==='left'` y `leftReason!=='after_end'`, el título es «Quedaste fuera» con tono `none`, y el detalle es:
  - con `timeout`: «Pasaste más de 5 min sin conexión y la partida siguió sin ti.»;
  - si no: «Abandonaste la partida antes del final.».
  - Así coincide con «Sin conexión» o «Abandonó» del informe común. Quien salió después del final (`after_end`) mantiene su resultado.
- **Prueba:** «C17 · …».
  - ANTES: `actual: 'Seguías libre al final'`.
  - DESPUÉS: ok.
- **Modos:** los tres.

### C18 · V-33 · Textos P3
- **«La primera pista llega sola…» al convertido:**
  - `game-view.js:481` `pingWaitText(snap)` dice «La próxima pista…» si `nextPingAt - activeStart > pingIntervalMs`, es decir, si ya hubo alguna.
  - `app.js:1018` la usa.
  - Prueba «C18 · el panel de pistas…».
- **«en secreto» en la sala del zorro:**
  - `game-view.js:490` `lobbyRolesHint(config)`, usado en `app.js:829`.
  - En la Caza del zorro dice: «“Sorteo” elige al zorro… desde ahí, todos sabrán quién es el zorro».
- **«Tu equipo gana/pierde» al zorro:** `personalResult` le da «Ganas» o «Pierdes». e2e: Zoe ve «Pierdes».
- **«SUPERVIVIENT/ES» partido a 360 px:**
  - `app.js:1052` añade `class="is-long"` al `h1` si alguna palabra tiene más de 11 letras.
  - `game.css:204`: `.result h1.is-long { font-size: clamp(22px, 7.6vw, 44px); }`.
  - Sin prueba unitaria: comprobación de navegador nº 6.
- **`forbidden`:**
  - `game-view.js:116` `commandErrorText(code, detail, cmdType)`. Si la acción es de anfitrión (configure, assign_team, start, abort, kick, end_game, rematch, new_code), el texto sigue siendo «Solo el anfitrión puede hacer eso.».
  - `set_ready`, `set_team_pref` y `join_rematch` tienen texto propio. Cualquier otra acción: «No puedes hacer eso.».
  - `app.js:281` (`cmd`) le pasa `command.type`.
- **Códigos de error:**
  - `busy` («Espera: aún se está enviando la acción anterior.») y `room_expiring` («La sala está a punto de caducar: crea una sala nueva para jugar.») están en `ERROR_TEXT` (`game-view.js:87-88`).
  - `room_expiring` llega por la vía normal: el aviso de `cmd`, o `errorText` al crear o unirse.
- **Tarjeta de conversión:**
  - Se anuncia por `announce()` (región `#sr-live`, `aria-live="assertive"`).
  - El comentario «hasta que la toque» ahora dice «Se cierra al tocarla o sola a los 15 s». El comportamiento no cambia.
- **Compartir el resultado:**
  - `reportShareText` dice «THE OUTRUN · Mission Report · <modo>» y, en Infección, «N infectados».
  - Se ajusta `mobile/test/report.test.mjs`: la cabecera esperada pasa a terminar en «· Clásico».
- **Pruebas:** «C18 · …», 5 casos.
  - ANTES: todos fallan (undefined; «Tu equipo gana»; `'THE OUTRUN · Mission Report'`).
  - DESPUÉS: ok.

### Punto 4 · Reclamaciones pendientes al recibir `game_finished`
**Comprobado:**
- **Hoja del fugitivo «¿Te ha pillado X?»:** ya se cerraba. Se dibuja solo con `snap.pendingClaimForMe && phase==='ACTIVE'`, y la vista FINISHED no la trae.
- **Estado del cazador («Esperando a que X confirme»):** ya se limpiaba en `forgetStaleWarnings` al cambiar de fase. Además, ahora `game_finished` pone `ui.claimSent = null`.

**Defecto encontrado y corregido:** la hoja «¿Quién te ha pillado?» (`ui.sheet='selftag'`) quedaba en el estado al terminar.
- No se veía en FINISHED, pero **reaparecía sola al empezar la persecución de la revancha**.
- **Corrección:**
  - `game-view.js:452` `sheetAfterSnapshot`, aplicado en cada instantánea (`app.js:196`);
  - `ui.sheet=null` en `game_finished`.
- **Prueba:** «Punto 4 · al terminar la partida no queda abierta ninguna hoja de reclamación».
  - ANTES: undefined.
  - DESPUÉS: ok.

## Salida real

ANTES (`regresiones-ciclo.test.mjs` contra el código sin corregir):
```
not ok 1 … not ok 16   (# pass 0 · # fail 16)
C12: expected 'Contagio: Ana → Beto · Beto → Caro, Dani'  actual 'Contagio: Ana → Beto → Caro'
C17: actual 'Seguías libre al final'
C18 zorro: expected 'Ganas'  actual 'Tu equipo gana'
C18 compartir: actual 'THE OUTRUN · Mission Report'
(resto: la función no existía)
```

DESPUÉS, archivo por archivo:

| Archivo | Pasan | Fallan |
|---|---|---|
| regresiones-ciclo | 16 | 0 |
| modes | 8 | 0 |
| report | 7 | 0 |
| map-view | 14 | 0 |
| brand-and-privacy | 3 | 0 |
| briefing | 4 | 0 |
| gps-check | 3 | 0 |
| invite | 8 | 0 |
| lobby-status | 5 | 0 |
| location-bridge | 11 | 0 |
| location-denied | 2 | 0 |
| lockscreen | 6 | 0 |
| native-plugin | 5 | 0 |
| night | 2 | 0 |
| qr | 10 | 0 |
| reading-status | 6 | 0 |
| replay | 3 | 0 |
| result-and-ping | 6 | 0 |
| screen | 2 | 0 |
| view-model | 7 | 0 |
| game.test.mjs (solo ejecutado, no modificado) | 15 | 0 |

Sintaxis: `node --check` correcto en `app.js`, `zorro.e2e.mjs` e `infeccion.e2e.mjs`.

Antes de corregir fallaban modes (por la importación) y una prueba de report y otra de map-view. Era lo esperado: fijaban la semántica antigua y se han ajustado como se explica arriba.

## Comprobaciones de navegador para el coordinador
1. **e2e Caza del zorro:** `node e2e/zorro.e2e.mjs`. Aserciones nuevas:
   - la tarjeta de Beto contiene «El zorro es Zoe» y la de Zoe no;
   - tras cerrarla, el `.callout` de Beto lo dice en la huida;
   - el de Ana, en la persecución;
   - `.result-me` de Zoe dice «Pierdes».

   Captura `02-rol-Beto`.
2. **e2e Infección:** `node e2e/infeccion.e2e.mjs`.
   - El informe exige «Contagio: Ana → Beto · Beto → Caro, Dani».
   - Ninguno de los cuatro tiene `.overlay.reveal` sobre el informe (Dani, el último infectado, era el caso del fallo).
   - La tarjeta de Beto debe seguir apareciendo una sola vez y decir «Podrás capturar dentro de 1:00» (o algo menos).
3. **C14 (manual o script):** fugitivo de Infección.
   1. Responde «Sí, me ha pillado».
   2. Corta la red (DevTools sin conexión) más de 20 s, o recarga pasados 20 s.
   3. Al volver debe aparecer una vez «Te han infectado · ahora eres CAZADOR» con la espera real.
   4. Otra recarga no debe repetirla (clave `outrun.converted` en `localStorage`).
4. **C13:** justo tras una conversión (antes del siguiente envío de 5 s), el mapa o radar del convertido no debe mostrar a los fugitivos como «Tu equipo». Los fugitivos tampoco deben ver al convertido. Cuando alguien abandona, su marca desaparece al momento.
5. **C16:** Caza del zorro con 3 jugadores.
   1. Durante la cuenta atrás, un jugador pulsa dos veces «Abandonar la partida».
   2. Los otros dos deben ver el aviso «Se ha cancelado el inicio: alguien ha salido y faltan jugadores. Vuelve a pulsar «Estoy listo»…».
   3. El aviso sigue en la sala hasta pulsar «Estoy listo».
   4. Repetir con el anfitrión enviando `abort`: «El anfitrión ha cancelado el inicio.».
6. **360 px:** Infección que termine con tiempo agotado y alguien libre. El título «GANAN LOS SUPERVIVIENTES» no debe partir la palabra y no debe haber desbordamiento horizontal. «GANAN LOS CAZADORES» mantiene el tamaño grande.
7. **Punto 4:** Clásico o Infección.
   1. Un fugitivo abre «Me han pillado» (la hoja «¿Quién te ha pillado?»).
   2. El anfitrión termina la partida.
   3. Al hacer la revancha y llegar a la persecución, la hoja no debe reaparecer.
   4. Repetir con una reclamación pendiente del cazador: al terminar, no queda «Esperando a que X confirme».
8. **TalkBack:** al convertirse se anuncia «Te han infectado: ahora eres cazador. …». Al cancelarse la cuenta atrás se anuncia el motivo.
9. **Regresión general:** ejecutar también `playtest-ui.e2e.mjs`, `game.e2e.mjs`, `web-flow.e2e.mjs` y `map.e2e.mjs`. Se ha cambiado `mapModel` y los textos de `forbidden` y de compartir. Sus aserciones se han revisado y no dependen de los textos cambiados; «La primera pista llega sola» sigue saliendo antes de la primera pista.

## Archivos modificados
- `mobile/www/js/game-view.js`
- `mobile/www/js/app.js` (CRLF conservado)
- `mobile/www/css/game.css` (CRLF conservado)
- `mobile/test/regresiones-ciclo.test.mjs` (nuevo)
- `mobile/test/modes.test.mjs`
- `mobile/test/report.test.mjs`
- `mobile/test/map-view.test.mjs`
- `mobile/e2e/infeccion.e2e.mjs` (aserciones)
- `mobile/e2e/zorro.e2e.mjs` (aserciones)

`index.html` y `view-model.js` no han necesitado cambios. `#sr-live` ya existía, y `view-model.js` es la pantalla de diagnóstico GPS, ajena a estas correcciones.

## Pendientes y decisiones de producto
- **A3-9 · «Último superviviente»** solo aparece cuando caen todos. Parece una decisión de producto, así que no se ha cambiado. Queda abierto si debe salir también con tiempo agotado y un único libre.
- **Formato del contagio:** la línea única separada por «·» y el rótulo «Sin autor conocido» son de presentación. Si el propietario prefiere un árbol o una línea por infectador, solo cambia el `highlights.push` de `missionReport`.
- **Scripts de reproducción de QA:** `QA/…/reproducciones/agente3/motor-infeccion-casos.test.ts` y `sim-infeccion-escenarios.test.mjs` importan `contagionChains`, que ya no existe. Fallarán al importar. Eran scripts que documentaban el defecto A3-3 y no son del repositorio de pruebas; no se han tocado.
- **No tocados (fuera de V-33):**
  - A3-10: la hoja de autodeclaración ofrece a convertidos en espera y descarta el autor sin avisar.
  - A5-11: el mínimo «2 jugadores» antes de fijar la zona, y «2–20 jugadores» en el inicio.
  - A5-12: «Hiciste N capturas» al cazador inicial de Infección; `runners_abandoned` dice «fugitivos» en Infección; `target_location_stale` dice «del fugitivo» en el zorro.
  - A5-13: el texto de la expulsión, y que el aviso de presencia cuenta los 5 min desde la última señal.
- **`room_expiring`:** solo se ha añadido el texto. Si el motor lo envía con `detail` o por otra vía (evento en lugar de error), hará falta un `case` en `onEvent`.
- **Motivos de `countdown_aborted`:** si el agente del motor añade otros, caen en el texto genérico, que también pide volver a marcar «Estoy listo».
