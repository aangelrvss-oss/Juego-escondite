# Agente 3 (Infección): correcciones C20 y C21

## Cambios

### C21 · V-35: el simulador (herramienta, no el juego)
- `sim/panel/simulacion.mjs`
  - Líneas 532-545 (`describe`):
    - `runner_exposed` y `runner_unexposed` leen `d.runnerId`, que es lo que envía el motor. Antes leían `d.playerId` y salía «— expuesto».
    - `runner_unexposed` ahora dice «deja de estar expuesto», porque también se emite al convertir a un fugitivo expuesto.
    - Una infección o captura sin autor dice «(sin autor conocido)» en lugar de «por —».
  - Líneas 556-557: `rematch_offered` aparece en el registro: «Revancha: partida n.º N (sorteo nuevo)».
  - Líneas 578-582 (`outcomeText`): el modo se toma de la configuración de la sala. El texto dice «ganan los supervivientes» en Infección, «gana el zorro» en Caza del zorro y «ganan los fugitivos» en Clásico.
  - Líneas 217-232: `Avatar.resetForRematch()` devuelve al bot al punto de encuentro y le borra lo que sabía de la partida anterior (pistas, reclamaciones, guiado).
  - Líneas 660-705: nuevo `Simulation.rematch({ swapRoles = false })`. Hace la revancha real por comandos:
    1. El anfitrión actual (AVATAR_01 salvo traspaso) envía `{type:'rematch', swapRoles}`.
    2. Los bots invitados envían `join_rematch` y todos los que están en la sala, `set_ready`.
    3. El anfitrión envía `start`.

    No se unen quienes están desconectados, tienen la pestaña suspendida o juegan desde la interfaz; al empezar, el motor los deja fuera. Si falla, lo anota en `errors`.
- Panel (opcional; era trivial):
  - `sim/panel/servidor.mjs:156`: acción `revancha`.
  - `sim/panel/www/index.html:50`: botón «Revancha».
  - `sim/panel/www/panel.js:175`: el botón solo se activa con la partida en FINISHED y el panel libre.

### C20 · V-34: pruebas del simulador endurecidas (`sim/panel/test/simulacion.test.mjs`)
- **Prueba de los 3 modos (:44-77):** antes aceptaba cualquier resultado. Ahora exige que el resultado cuadre con el estado:
  - El final es `all_captured` o `time_up`.
  - `all_captured` ⇒ gana `hunter` y no queda ningún fugitivo activo.
  - `time_up` ⇒ gana `runner` y queda alguno activo.
  - Nadie queda fuera y nadie es capturado dos veces.
  - En Infección: todas las capturas tienen `converted`; cada capturado es cazador activo; nadie queda en `captured`; cazadores = iniciales + infectados; el texto dice «ganan los supervivientes» o «ganan los cazadores».
  - En Clásico y Caza del zorro: cada capturado está en `captured`, y el texto del final es el de su modo.
- **Desconexión de 5 min (:98-110):** se quita el `if (phase === 'ACTIVE')`. La comprobación ya no depende de los bots: un fugitivo desconectado no se puede capturar porque su lectura caduca, y la partida no acaba mientras siga activo.
  - Se exige `status left` y `leftReason timeout`, y que el registro lo cuente.
  - También se exige que la fase sea ACTIVE, o FINISHED con `runners_abandoned` si era el último fugitivo.
- **Espera de Infección (:155-175):** se mantiene `canTagFrom − convertedAt = 60 000`. Además:
  - Una `claim_tag` real enviada por el convertido durante la espera se rechaza exactamente con `{ok:false, error:'tag_cooldown'}`.
  - Pasados 65 s, el error ya no es `tag_cooldown`.
- **Nueva prueba (:177-217), «revancha real por comandos (Infección)»:**
  - Comprueba los textos V-35: «expuesto» con `runnerId`, «sin autor conocido», «ganan los supervivientes», ningún «—» en el registro y «X infectado por Y».
  - Termina la partida con `finish` y llama a `rematch()`. Comprueba:
    - `gameNo` 2, COUNTDOWN e Infección;
    - 10 activos y 2 cazadores;
    - `captures` y `claims` vacíos;
    - `canTagFrom`, `convertedAt` y `pingsBeforeConversion` a null en los 10.
  - La revancha llega a terminar con un resultado del motor y sin errores.

### C20: presencia con la cadencia real (nuevo `server/test/presencia-real.test.mjs`, 5 pruebas)
- **Cómo se simula el tiempo:**
  - No usa `advance()` de helpers.mjs (que llama a `keepAliveConnected`): el reloj del `testServer` avanza a mano y solo se llama a `server.pump()`.
  - Cada cliente es un `GameConnection` real (net.js) con `now` igual al reloj del servidor. Así su regla real («ping si han pasado ≥ 10 s», al recibir las posiciones cada 5 s) genera un ping cada 10 s de juego.
  - En cada paso se espera a que lleguen las posiciones y los `pong`, de modo que el resultado no depende de la velocidad de la máquina.
  - La página congelada se simula con un socket que descarta los envíos.
- **Casos:**
  1. 12 min de persecución con pings reales: nadie aparece nunca «sin conexión» ni queda fuera. Hay ≥ 70 pings por cliente, el hueco máximo entre pings es ≤ 10 s y el silencio máximo que ve el motor es ≤ 10 s.
  2. Página congelada:
     - a `lastSeenAt + 29 999` ms todavía no está «sin conexión»; a +30 000 exactos, sí;
     - a los 31 s sigue así, con el socket abierto y aviso a los demás;
     - con `wake()` vuelve y los demás reciben `away:false`.
  3. Uno con el socket cerrado y otro congelado:
     - 5 s antes del plazo siguen activos (y «sin conexión»);
     - a los 5 min + 10 s quedan `left/timeout`;
     - los que envían pings siguen activos, la partida sigue y todos reciben `player_left` con motivo `timeout`.
  4. Infección: un convertido sin señal queda `left/timeout` (sale como cazador) y la partida sigue con la cazadora inicial.
  5. Infección: la cazadora inicial abandona y el convertido sin señal era el último cazador. A 5 s del plazo la partida sigue; después termina con `{winner:null, cause:'hunters_abandoned'}`, que reciben los dos supervivientes.

### C20: Infección a nivel de modo (nuevo `engine/test/infeccion-ciclo.test.ts`, 9 pruebas, motor puro)
- **Reparto con `start` real**, n = 4..20 × 3 semillas, comparado con una tabla escrita a mano (sin repetir la fórmula). Se mantiene al revelar los roles.
- **Asignación manual con n = 9:** con 2 cazadores fijados, empieza; con 3, `teams_unbalanced/infection`; con 1 y un jugador «al azar», empieza con 2.
- **Bordes exactos de la espera de 60 s:**
  - reclamar a 59 999 ms → `tag_cooldown`; a 60 000 ms → aceptada, y la vista pasa a `canTagFrom = null`;
  - autodeclaración a 59 999 ms → `hunterId: null` (`via: self`, `converted`); a 60 000 ms se atribuye al convertido.
- **Presencia y espera:** desconexión, «sin conexión» (31 s), reconexión y `seen` no cambian `canTagFrom`, ni en el estado ni en la vista. A `until − 1` da `tag_cooldown`; a `until` se acepta.
- **Cadena con dos ramas** (h→r1, r2; r1→r3; r2→r4; r5 autodeclarado sin autor): `contagionGroups` (importado de `mobile/www/js/game-view.js`) devuelve los 4 grupos exactos y no se pierde ninguna infección. El informe muestra «Contagio: h → r1, r2 · r1 → r3 · r2 → r4 · Sin autor conocido → r5».
- **Último superviviente:** cae ante un convertido ⇒ `all_captured`, gana `hunter`, todos son cazadores activos; el informe dice «Ganan los cazadores», «Todos infectados» y «Último superviviente: r3…».
- **Tiempo agotado con un único superviviente** ⇒ `time_up`, gana `runner`, «Ganan los supervivientes».
- **Revancha:** al terminar, `canTagFrom` sigue en el futuro, hay `pingsBeforeConversion = 1` y una reclamación pendiente.
  - La vista ya no muestra `canTagFrom` ni en el final ni en la sala de la revancha (C19).
  - Tras el `start` de la revancha: `gameNo` 2, `claims` vacío, `captures` vacío, `outcome`, `lastPing` y `pingCount` a cero o null, y los tres campos a null en todos. El sorteo da 1 cazador.
  - Ya en la persecución, el cazador del sorteo reclama sin espera.
- La interfaz, que es JS sin tipos, se importa con `import()` dinámico tipado para que `tsc` no exija declaraciones. **No he ejecutado `tsc`**, para no gastar memoria.

## Resultados reales (de uno en uno, `node --test --test-concurrency=1`)
| Ejecución | Pruebas | Resultado | Duración |
|---|---|---|---|
| `server/test/presencia-real.test.mjs` | 5 | 5 superadas, 0 fallidas | 15,2 s |
| `engine/test/infeccion-ciclo.test.ts` | 9 | 9 superadas, 0 fallidas | 0,54 s |
| `sim/panel/test/simulacion.test.mjs`, 1.ª | 15 | 15 superadas, 0 fallidas | 108,3 s |
| `sim/panel/test/simulacion.test.mjs`, 2.ª | 15 | 15 superadas, 0 fallidas | 100,6 s |
| `sim/panel/test/simulacion.test.mjs`, 3.ª | 15 | 15 superadas, 0 fallidas | 92,9 s |

- La memoria libre antes de cada ejecución estaba entre 468 y 854 MB.
- Las salidas completas están en `a3-sim-run1.txt`, `a3-sim-run2.txt` y `a3-sim-run3.txt` de esta carpeta.

## Fallos reales del juego encontrados
Ninguno. Todo lo que comprueban las pruebas nuevas el motor y el servidor ya lo cumplen: presencia con la cadencia real, bordes de 60 s, cadena con ramas, finales, revancha y la vista sin `canTagFrom` fuera de juego.

## Pendientes
- Sigue habiendo restos en el estado interno del motor entre el final y el `start` de la revancha (`convertedAt`, `canTagFrom` y `pingsBeforeConversion` en `RoomState`). La vista ya no los muestra (C19) y `start` los limpia. Ya se conocía (A3-5); no se ha cambiado nada.
- El simulador sigue sin autodeclaración, sin asignación manual y sin tamaños distintos de 10 (A3-8). No se pedía.
- Falta convertir en prueba del repositorio el script `reproducciones/coordinador/escenarios-10.mjs` (C20). Se ha dejado al agente de Caza del zorro, que crea `escenarios-completos.test.mjs`.
- Falta `npm run typecheck`, que no se ha ejecutado.
