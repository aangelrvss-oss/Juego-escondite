# Agente 5 · QA de experiencia de juego e interfaz (solo lectura)

Ámbito: `mobile/www/js/app.js`, `game-view.js`, `net.js`, `map-view.js`, `radar.js`, `css/game.css`, contrastados con `engine/src/engine.ts`, `engine/src/view.ts` y `server/hub.ts`, más las pruebas e2e y las capturas de `QA/ciclo-20261030-simulacion/capturas/`. No se ha ejecutado nada ni se ha modificado ningún archivo del repositorio.

## Hallazgos (por prioridad)

### A5-1 · Caza del zorro · Huida y persecución (cazador) · Ningún sitio de la interfaz dice quién es el zorro — P1 · confianza alta
- **Qué pasa:** la regla (§11.3, D-057 §3) dice «roles públicos tras la cuenta atrás: todos saben quién es el zorro». El servidor ya envía el equipo del zorro a todos los cazadores (`engine/src/view.ts:166-167`), pero la interfaz no lo muestra:
  - la tarjeta de rol del cazador solo dice «En esta partida todos sabrán quién es el zorro» (`app.js:1099`), sin nombrarlo;
  - el texto del cazador dice «Caza al zorro…» (`app.js:885-887`), sin nombre;
  - el mapa solo pinta compañeros (`game-view.js:448-451`).
  
  Durante toda la huida, el cazador no puede saber a quién perseguir. En la persecución solo lo deduce del botón de reclamar (`app.js:957-958`) o del nombre de la pista.
- **Evidencia:** `QA/ciclo-20261030-simulacion/capturas/escenario-fox_hunt-1-huida.png`: la vista de cazador de AVATAR_02 no menciona a AVATAR_04, que es el zorro. `zorro.e2e.mjs` no comprueba que se nombre al zorro.
- **Cómo reproducirlo:** juega una Caza del zorro con 3 jugadores. En el móvil de un cazador, mira la tarjeta de rol, el HUD y la leyenda durante la huida: no aparece el nombre del zorro.
- **Propuesta:** «El zorro es X» en la tarjeta de rol, bajo el reloj (en los dos roles) y en la leyenda. El dato ya llega en `snap.players[].team`.

### A5-2 · Infección · Final · La tarjeta «Te han infectado · ahora eres CAZADOR… Podrás capturar dentro de 1 min» tapa el Mission Report — P2 · confianza alta
- **Qué pasa:** cuando se infecta al último fugitivo, `convert()` emite `role_changed` y, en el mismo paso, `checkEnd` termina la partida (`engine.ts:484-485`).
  - El cliente crea la tarjeta para 15 s (`app.js:280`).
  - `game_finished` borra los avisos, pero no `ui.reveal` (`app.js:366-370`).
  - `overlays()` no mira la fase (`app.js:1088-1094`).
  
  El último infectado ve, encima del informe final, «Podrás capturar dentro de 1 min» con la partida ya terminada.
- **Cómo reproducirlo:** es el propio `infeccion.e2e.mjs:160-166`. Cuando Dani se autodeclara infectado por Beto, haz una captura del móvil de Dani: la tarjeta tapa el informe.
- **Propuesta:** en `game_finished` (y en cada instantánea `FINISHED`), `ui.reveal = null`, o no dibujar la tarjeta fuera de `ACTIVE`/`HEAD_START`.

### A5-3 · Todos los modos · Cuenta atrás → sala · Volver a la sala durante la cuenta atrás no se explica — P2 · confianza alta
- **Qué pasa:** el motor emite `countdown_aborted` con `reason` (`team_empty`, o `aborted_by_host`) (`engine.ts:412-425`, `engine.ts:654`, `engine.ts:892`). `onEvent` no tiene ningún `case` para ese evento (`app.js:273-374`).
- **Qué ve el jugador:** pasa de «La partida empieza en 3» a la sala sin ningún mensaje, y su «Listo» desaparece (`backToLobby` pone `ready=false`).
- **Por qué importa:** en la Caza del zorro la regla lo prevé expresamente («si en la cuenta atrás quedan menos, se vuelve a la sala», §11.3).
- **Cómo reproducirlo:** Caza del zorro con 3 jugadores; durante la cuenta atrás, uno pulsa dos veces «Abandonar la partida». Los otros dos vuelven a la sala sin explicación.
- **Propuesta:** un aviso como «Se ha cancelado el inicio: X ha salido y faltan jugadores» o «El anfitrión ha cancelado el inicio. Vuelve a pulsar Listo». (`rematch_offered` tampoco tiene aviso; es menor, porque la sala muestra «Unirme a la revancha».)

### A5-4 · Todos los modos · Mission Report de quien quedó fuera por 5 min sin conexión · El «Tu partida» personal contradice el informe — P2 · confianza alta
- **Qué pasa:** `personalResult` (`game-view.js:305-329`) no tiene en cuenta `status === 'left'` ni `leftReason === 'timeout'`.
  - Un fugitivo de Clásico que quedó fuera lee «Tu equipo gana · Seguías libre al final» (`game-view.js:321`).
  - Un cazador lee «No hiciste ninguna captura».
  - Mientras tanto, el informe común dice «Sin conexión» (`game-view.js:286`), y D-057 lo equipara a abandonar.
- **Cómo reproducirlo:** en el simulador, desconecta a un fugitivo más de 5 min. Al terminar la partida, vuelve a conectarlo y mira «Tu partida».
- **Propuesta:** si `self.status === 'left'` (y no `after_end`), un detalle como «Quedaste fuera a los mm:ss por falta de conexión», con tono neutro.

### A5-5 · Infección · Mission Report · La «cadena de contagio» pierde ramas — P2 · confianza alta
- **Qué pasa:** `contagionChains` sigue solo a la primera víctima de cada persona (`game-view.js:251-254`). Las demás infecciones no aparecen en ninguna cadena.
- **Evidencia:**
  - `escenario-infection-3-final-completa.png`: AVATAR_05 infectó a 09, 10, 01 y 04, y 01 infectó a 06, pero «Momentos» solo dice «Contagio: AVATAR_05 → AVATAR_09».
  - `infeccion.e2e.mjs:174` deja fijado como correcto «Ana → Beto → Caro», aunque Beto infectó también a Dani.
- **Regla:** «el informe muestra la cadena de contagio» (D-057 §2). Ahora mismo el informe es incompleto, aunque la cronología sí lista todas las infecciones.
- **Propuesta:** dibujar un árbol («Ana → Beto → Caro, Dani»), o una línea por cada infectador con todas sus víctimas.

### A5-6 · Infección · Convertido que vuelve tras un corte · Sin tarjeta ni aviso de la conversión — P2 · confianza media
- **Un convertido nunca está sin conexión en el momento de convertirse:** la conversión exige su acción, sea `respond_tag` aceptado o `self_tag` (`engine.ts:452-485`, `engine.ts:708-728`).
- **Caso real:** pulsa «Sí, me ha pillado» y se pierde la conexión antes de recibir `role_changed`, o Android cierra la vista web. Vuelve más de 15 s después.
- **Qué ocurre al volver:**
  - El evento llega repetido, con `ageMs > 15 s`.
  - `isStaleEvent` lo marca como antiguo (`game-view.js:394-398`), así que no hay tarjeta (`app.js:280`).
  - Tampoco aparece «Te han infectado: ahora cazas», porque `notify` no hace nada para los eventos antiguos (`app.js:271`, `app.js:363`).
  - Si la cola de reenvío no cubre el hueco, no llega ni el evento.
- **Qué le queda:** solo el chip «CAZADOR» y, si aún no han pasado los 60 s, «Acabas de convertirte: podrás capturar en…» (`app.js:952-955`). Pasado ese minuto, nada le explica el cambio.
- **Propuesta:** deducir la tarjeta de la instantánea, no del evento. Por ejemplo, si existe `captures[]` con `runnerId === yo && converted` y aún no se ha mostrado en este `gameNo` (guardado en `localStorage`), mostrarla. Otra opción: añadir `role_changed` a las excepciones de `isStaleEvent`.

### A5-7 · Infección · Mapa del recién convertido (y de los fugitivos) · Hasta 5 s con posiciones del equipo anterior mal etiquetadas — P2 · confianza alta
- **Qué pasa:**
  - `role_changed` no vacía `ui.positions` (`app.js:278-286`).
  - El servidor manda posiciones solo cada 5 s (`server/hub.ts:783-805`), no al cambiar el estado.
  - Entretanto, `mapModel` pinta a los antiguos compañeros fugitivos como `mate` con el color del equipo nuevo, «Tu equipo» en naranja de cazador (`game-view.js:448-451`).
- **Consecuencias:** el convertido sigue viendo a los fugitivos (como si fueran cazadores), lo que va contra «deja de ver a los fugitivos». Los fugitivos, por su parte, siguen viendo al convertido como compañero.
- **Propuesta:** en `role_changed`, `ui.positions = []`. En `mapModel`, descartar los `teammate` cuyo `team` en la instantánea no coincida con el propio.

### A5-8 · Infección · Panel de pistas del recién convertido · Dice «La primera pista llega sola…» aunque ya se han enviado pistas — P3 · confianza alta
- El convertido no recibe la última pista (`view.ts:173-174`), así que `ping` es null y `pingList` muestra el texto previo a la primera pista (`app.js:973-977`). Es engañoso: tiene que decir «Recibirás la próxima pista…».

### A5-9 · Infección · Tarjeta de conversión · El comentario y el comportamiento no coinciden — P3 · confianza alta
- El comentario dice «la tarjeta se queda hasta que la toque» (`app.js:279`), pero desaparece sola a los 15 s (`app.js:280`, `app.js:1416-1418`).
- El texto fija «dentro de 1 min» en lugar de usar `canTagFrom`.
- No se anuncia a lectores de pantalla (no usa `announce`).

### A5-10 · Infección · Autodeclaración nombrando a un convertido en espera · La atribución se descarta en silencio — P3 · confianza alta
- La hoja «¿Quién te ha pillado?» incluye a los convertidos que aún esperan (`app.js:1117-1121`). El motor descarta esa atribución (`engine.ts:723-726`), y el informe la muestra como «autodeclarada» sin cazador. Nadie lo explica.

### A5-11 · Sala (anfitrión) · Textos que no dependen del modo — P3 · confianza alta
- «Roles: «Sorteo» los reparte el servidor en secreto…» (`app.js:792`) también aparece en la Caza del zorro, donde los roles son públicos.
- Antes de fijar la zona, `startBlockers` usa el mínimo de Clásico, «al menos 2 jugadores» (`game-view.js:539-540`), aunque el anfitrión eligiera Infección en el inicio. Además, la elección de modo del inicio no se envía hasta que se centra la zona (`app.js:1200`).
- No hay aviso previo si las asignaciones manuales no dejan exactamente un zorro o el número exacto de cazadores. El rechazo `teams_unbalanced` solo llega al pulsar «Empezar».
- En el inicio, «Antes de salir · 2–20 jugadores» (`app.js:731`) no depende del modo (Infección necesita 4–20).

### A5-12 · Infección / Caza del zorro · Textos del informe y compartir — P3 · confianza alta
- `reportShareText` no incluye el modo y siempre dice «capturas» (`game-view.js:357-368`), incluso en Infección.
- `personalResult` dice «Tu equipo gana» al zorro, que juega solo, y «Hiciste N capturas» al cazador inicial de Infección (`game-view.js:309`, `game-view.js:326`).
- En Infección, `runners_abandoned` se muestra como «Los fugitivos abandonaron», cuando ahí se llaman supervivientes (`game-view.js:110`, `game-view.js:231`).
- `target_location_stale` dice «del fugitivo» también en la Caza del zorro (`game-view.js:78`).
- La cabecera parte la palabra «SUPERVIVIENT/ES» a ~360 px (`escenario-infection-3-final-completa.png`); falta `hyphens`/`overflow-wrap`, o reducir el tamaño de letra.

### A5-13 · Todos · Expulsión y aviso de presencia — P3 · confianza alta
- **Expulsado:** solo lee «Ya no estás en la sala.» (`game-view.js:48`, `app.js:205-208`), y el texto aparece bajo el campo del código (`homeErrorField`, `app.js:658`). Si vuelve a intentar entrar, `blockedDevices` responde `not_found`: «No existe ninguna sala con ese código.» (`engine.ts:754`). Es coherente con la privacidad, pero confuso.
- **Aviso de presencia:** «Si no vuelven en 5 min, quedan fuera» (`app.js:1051`) se cuenta desde la última señal, no desde ahora; para entonces ya han pasado 30 s.
- **`forbidden`:** siempre dice «Solo el anfitrión puede hacer eso.» (`game-view.js:57`), aunque el motor también lo usa con quien no es anfitrión: `set_ready` de un invitado y `join_rematch` de quien no está invitado (`engine.ts:617`, `engine.ts:740`).
- **Código sin texto:** `busy` (`net.js:403`) no tiene traducción y se mostraría «Error: busy». Es casi imposible que ocurra, porque `ui.entering` lo evita.

## Verificado como correcto
- **Inicio:** solo aparecen los tres modos jugables y ningún «Próximamente» (`game-view.js:16-35`, `app.js:673-684`; `inicio.e2e.mjs:54`). Sardines no aparece en `mobile/www` ni en el simulador (búsqueda sin resultados).
- **Códigos de rechazo:** todos los del motor tienen texto en español en `ERROR_TEXT` (`game-view.js:41-87`). Lo mismo los del hub (`bad_message`, `rate_limited`, `already_in_room`, `server_full`, `too_many_rooms`, `bad_session`, `no_session`, `removed`) y los del cliente (`offline`, `replaced`, `no_response`, `invalid_code`). Comparado con `engine.ts:126-935` y `hub.ts:389-713`. Hay textos por modo para `not_enough_players` y `teams_unbalanced` (`game-view.js:95-103`).
- **`tag_cooldown`:**
  - durante la espera, la interfaz no ofrece botones de reclamar y muestra una cuenta atrás con la hora del servidor (`app.js:951-955`), a partir de `snap.canTagFrom` (`view.ts:205`);
  - si se rechaza por un pequeño desfase de reloj, el texto es comprensible (`game-view.js:86`);
  - el botón reaparece solo, sin esperar a otra instantánea, porque se redibuja cada 250 ms (`app.js:1413-1414`).
- **Lo que el convertido deja de recibir:**
  - la última pista: la instantánea pone `lastPing` a null y `ui.ping` se reemplaza en cada instantánea (`view.ts:173-174`, `app.js:185`);
  - los avisos de fugitivo: zona, «tu posición acaba de llegar» y la hoja «Me han pillado» se cierran (`app.js:281-284`), y `forgetStaleWarnings` los limpia;
  - las reclamaciones contra él: desaparecen de `pendingClaimForMe`;
  - el radar de fugitivo: la leyenda y las acciones pasan a las de cazador porque usan `team` de la instantánea (`app.js:878-923`).
- **Lo que ven los demás en Infección:**
  - el aviso «X ha sido infectado: ahora caza» (`app.js:363`);
  - el contador «Infectados» (`app.js:924`);
  - los cazadores ya no pueden reclamar al convertido, porque `rivals` excluye a los compañeros visibles (`game-view.js:415-419`);
  - los fugitivos sí lo tienen en su hoja de autodeclaración.
- **Mission Report de Infección:**
  - convertidos en «Cazadores» como «Infectado a los mm:ss» (`game-view.js:281-288`);
  - «Último superviviente» (`game-view.js:205-208`);
  - resultado personal «Te infectó X…; después infectaste a N» (`game-view.js:313-318`).
- **Caza del zorro:**
  - «Zorro» en el desplegable de la sala, el chip y la tarjeta (`app.js:756`, `game-view.js:37`);
  - el zorro entiende lo que ve: texto, leyenda «Cazadores (en directo)» y que no tiene «Tu equipo» (`app.js:885-887`, `app.js:934-939`);
  - las pistas, el aviso «Nueva pista: posición del zorro» y el texto «dónde estaba el zorro…, no dónde está ahora» (`app.js:336`, `app.js:977-981`);
  - el final «Zorro atrapado» / «Gana el zorro», con el grupo «Zorro» en el informe (`game-view.js:105`, `game-view.js:227`, `app.js:1039`).
- **Clásico:** ningún texto de Infección ni del zorro. Todas las ramas dependen de `config.mode`, `d.converted` (solo lo emite `convert()`) o `role_changed` (solo en Infección): `app.js:336-337`, `app.js:363-364`, `app.js:883-889`, `app.js:924`, `app.js:1004`, `app.js:1016`, `app.js:1021`; `game-view.js:154-176`, `game-view.js:202-227`.
- **Presencia (D-057):** la línea «Sin conexión: …» va sin equipo ni hora (`app.js:1048-1052`), y se avisa de «no da señales» / «ha vuelto» / «ha quedado fuera» (`app.js:292-298`).
- **Quien vuelve tarde:**
  - ve «Estás fuera de la partida» con el motivo (`app.js:1062-1070`);
  - recibe el final, porque `canReceive` le deja ver lo público (`view.ts:12-17`);
  - queda invitado a la revancha (`engine.ts:949-971`), y la sala le muestra «Unirme a la revancha» (`app.js:788`).
- **Relojes:** todos los temporizadores de partida usan la hora del servidor (`serverNow()`): fases, reclamación (30 s), zona, pistas, espera del convertido y antigüedad de las posiciones (`app.js:87`, `net.js:123-125`, `net.js:343-346`). Solo el aviso nocturno usa la hora local, y es intencionado (`app.js:772`).
- **Reconexión:**
  - los eventos repetidos llegan después de la instantánea y con su antigüedad (`net.js:333-353`);
  - la reclamación pendiente propia se recupera de la instantánea (`app.js:187-190`);
  - los avisos de otra fase se borran (`app.js:236-252`);
  - el texto de conexión depende de la fase (`game-view.js:590-598`);
  - «abierta en otra pestaña» tiene pantalla propia (`app.js:1055-1059`).

## Comprobaciones en navegador o móvil real (para el coordinador)
1. **A5-1:** con `zorro.e2e.mjs` o el simulador en Caza del zorro (`Juegas como` = un cazador), haz capturas de la tarjeta de rol, la huida y la persecución del cazador. Busca el nombre del zorro.
2. **A5-2:** con `infeccion.e2e.mjs`, después del bucle de autodeclaraciones (línea 166), añade `await shot(dani, 'final-dani')` o mira el móvil de Dani. Comprueba si `.overlay.reveal` tapa el informe.
3. **A5-3:** Caza del zorro con 3; durante la cuenta atrás (5 s), un jugador abandona. Observa qué ven los otros dos al volver a la sala.
4. **A5-4:** en el simulador, desconecta a un fugitivo más de 5 min (Clásico), deja terminar la partida y vuelve a conectarlo. Mira «Tu partida» y el informe.
5. **A5-6:** en la interfaz real como fugitivo de Infección, recibe una reclamación y, justo al pulsar «Sí, me ha pillado», activa el modo sin conexión de las herramientas de desarrollo durante 20 s. Al volver, comprueba si aparece la tarjeta o un aviso.
6. **A5-7:** tras una conversión, haz capturas del mapa del convertido a 0, 2 y 6 s. Mira si los antiguos compañeros aparecen como «Tu equipo» en naranja.
7. **Móvil real a 360 px:**
   - corte de «GANAN LOS SUPERVIVIENTES»;
   - la tarjeta de conversión no debe tapar la hoja de reclamación;
   - la franja «Acabas de convertirte…» del panel fijo inferior no debe tapar el mapa;
   - aviso de vibración al convertirse (Android).
8. **Lectores de pantalla (TalkBack):** comprobar que se anuncian la conversión y el cambio de rol (no hay `announce` en `role_changed`).
