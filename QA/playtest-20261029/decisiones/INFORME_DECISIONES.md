# THE OUTRUN · Decisiones aprobadas para el primer playtest · 29/10/2026

## Veredicto: LISTO CON CONDICIONES (sin cambios respecto al 29/10 por la mañana, con menos riesgos abiertos)

Las cinco decisiones están implementadas y probadas en automático. **Siguen sin validar:**
- la partida en la calle con móviles;
- el túnel;
- el mapa desde el dominio del túnel;
- la reconexión con modo avión.

**Condición nueva:** reiniciar el servidor, porque el que está en marcha usa el motor anterior.

## Estado de partida

- **Repositorio:** rama `mapa-real`, HEAD `462016d`, 44 entradas sin commit, igual que al terminar la tarea anterior.
- **Respaldo previo:** `C:\Users\aange\Downloads\outrun-respaldo-20261029-004640-antes-decisiones\`, con todos los archivos sin commit y el diff, sin `mapa.config.json`.
- **Evidencias anteriores** (`QA/playtest-20261029/registros`, `capturas`, `INFORME_PLAYTEST.md`): intactas. Las nuevas están en `QA/playtest-20261029/decisiones/`.
- **Sin cambios** de rama, commits, push, clave ni restricciones de MapTiler.

## 1. Decisiones aplicadas

| Decisión | Antes | Ahora | Cambio |
|---|---|---|---|
| **Revancha con sorteo nuevo** | `rematch()` copiaba el equipo anterior como preferencia: los mismos equipos | Todas las preferencias vuelven a «Sorteo». El reparto se hace al pulsar «Empezar», **antes de la cuenta atrás**, con las reglas de siempre | `engine.ts`, 1 línea de lógica. Sigue la regla `ceil(n/4)` cazadores, la asignación manual del anfitrión en la sala y la revelación tras la cuenta atrás (D-042). `swapRoles:true` (intercambio pedido expresamente, no lo usa la interfaz) sigue igual |
| **Equipos de todos al terminar** | Ocultos también en FINISHED | En FINISHED, todos ven el equipo de todos. **En el resto de fases, igual que antes** | `view.ts`, `teamVisibleTo`: una condición |
| **Nombre de quien sale** | La vista quitaba a quien salía: «Alguien» | Quien jugó esta partida y sale sigue en la vista de FINISHED, con estado `left`. Su nombre y su equipo salen igual para todos y tras reconectar. En la sala de la revancha no aparece como jugador | `view.ts`, filtro de jugadores |
| **Pista sin capturados** | Las pistas nuevas ya no incluían a capturados (verificado). Pero la **última pista guardada** conservaba su posición y se reenviaba al cazador que reconectaba | Al capturar o abandonar, su entrada sale de la última pista | `engine.ts`, `forgetInLastPing` |
| **Intervalo ≥ duración** | Aceptado: no llegaba ninguna pista | Rechazado (`invalid_config`, campo `pingIntervalMs`). Mensaje: «Las pistas tienen que llegar antes de que acabe la persecución: elige un intervalo de pistas menor que la duración.» Si el anfitrión acorta la persecución por debajo del intervalo, la interfaz lo ajusta y lo explica | `config.ts` (1 línea), `game-view.js` y `app.js` |

**Resumen de partida:** la lista de jugadores se agrupa en **Cazadores / Fugitivos**, con lo que ya era público («2 capturas», «Captura a los 4:12») y el estado («Libre al final», «Abandonó»). No hay estadísticas nuevas y el diseño visual es el mismo.

Registrado como **D-056** en `DECISION_LOG.md`. En `QA/DECISIONES_PENDIENTES.md` quedan marcadas como resueltas.

**Ningún conflicto** con decisiones previas:
- la revancha con sorteo es una de las dos opciones que aprobó D-037;
- revelar los equipos al final era una pregunta abierta de la trazabilidad;
- ninguna de las dos exigía un cambio sustancial del motor.

## 2. Archivos modificados en esta tarea

| Archivo | Cambio |
|---|---|
| `engine/src/engine.ts` | +16/−1: revancha y `forgetInLastPing` |
| `engine/src/view.ts` | +6/−2: equipos en FINISHED y quien sale |
| `engine/src/config.ts` | +3: intervalo menor que la duración |
| `mobile/www/js/game-view.js` | `reportParticipants` (con equipo y estado) y mensaje del intervalo (`errorText` con el campo) |
| `mobile/www/js/app.js` | Lista por equipos (`rosterHtml`), mensaje al ajustar el intervalo y motivo del rechazo |
| `mobile/www/css/game.css` | +3: color del equipo en la lista |
| `engine/test/playtest-decisions.test.ts` | **Nuevo:** 12 pruebas |
| `server/test/playtest-decisions.test.mjs` | **Nuevo:** 3 pruebas con servidor y clientes reales |
| `server/test/multiplayer.test.mjs` | La prueba de privacidad acepta equipos ajenos **solo** en FINISHED, y exige que allí estén todos y sean iguales para todos |
| `mobile/test/result-and-ping.test.mjs` | Participantes con equipo y mensaje del intervalo |
| `mobile/e2e/playtest-ui.e2e.mjs` | Equipos en el resumen, revancha en «Sorteo», ajuste del intervalo, nombre de quien sale tras recargar. Espera a lecturas estables antes de capturar y resincroniza tras los saltos de reloj |
| `mobile/e2e/game.e2e.mjs` | Su comprobación de privacidad acepta equipos ajenos solo en FINISHED, y exige que sean los reales |
| `mobile/e2e/web-flow.e2e.mjs` | Comprueba que la revancha empieza en «Sorteo» y vuelve a asignar a mano para su escenario de abandono |
| `DECISION_LOG.md` | D-056 |
| `QA/DECISIONES_PENDIENTES.md` | Decisiones marcadas como resueltas |
| `QA/playtest-20261029/PROTOCOLO_PRIMER_PLAYTEST.md` | Texto de la revancha y de los equipos actualizado |
| `QA/playtest-20261029/decisiones/` | **Nuevo:** este informe, el ensayo, los registros y las capturas |

**Sin tocar:** `server/hub.ts`, `map-view.js`, `mapa.config.json` y las reglas de juego (tiempos, distancias, visibilidad durante la partida, victoria y modos).

## 3. Pruebas ejecutadas (tras el último cambio; registros en `decisiones/registros/`)

| Prueba | Resultado | Qué verifica de lo pedido |
|---|---|---|
| TypeScript | OK | — |
| Motor | **157/157** (+12) | Revancha: todas las preferencias en «Sorteo». Reparto completo **antes** de la cuenta atrás, sin que nadie lo vea. Es un sorteo real: el reparto cambió en ≥10 de 20 semillas. Asignación manual del anfitrión respetada. Equipos ocultos durante la partida y visibles en FINISHED, iguales para todos y en una instantánea nueva. Ocultos otra vez en la revancha. Nombre y equipo de quien sale. Pista sin capturados ni quien abandona. Intervalo 10/10 y 15/10 rechazados, 5/10 aceptado |
| Servidor | **78/78** (+3) | Por WebSocket real: equipos ocultos durante la partida, la misma vista final para todos y **tras reconectar**, nombre de quien salió, revancha con «Sorteo» y reparto al empezar, rechazo del intervalo con su detalle y su mensaje. `multiplayer`: equipos reales de todos al final |
| Cliente | **117/117** (+2) | Participantes por equipos; mensaje claro del intervalo |
| Partida de 5 navegadores | 8/8 | Privacidad del tráfico real con la nueva regla: equipos ajenos solo en FINISHED, y los correctos |
| `web-flow` | **42/42**, ×3 ejecuciones | Mission Report igual en los tres y tras recargar; la revancha empieza en «Sorteo» |
| Maquetación a 360 px | 6/6 | — |
| Mapa (cartografía de prueba) | 29/29 | — |
| Interfaz del playtest | **13/13**, ×3 ejecuciones | Ajuste del intervalo con su explicación. Resumen por equipos igual en tres navegadores. Revancha en «Sorteo». Nombre de quien sale («Captura de Beto por Ana», «Beto · abandonó») idéntico antes y después de recargar |
| Demo | 62/62 | — |
| Búsqueda de la clave en las evidencias | Ninguna aparición | — |

**Fallos encontrados por el camino** (corregidos, no ocultos):
- **`game.e2e` y la prueba `multiplayer` del servidor:** sus comprobaciones de privacidad prohibían ver equipos ajenos también al final, lo que contradice la decisión aprobada. Ahora lo exigen solo al final.
- **`web-flow`:** su escenario de abandono daba por hecho que la revancha conservaba los equipos. Con el sorteo nuevo, una de cada tres veces al jugador que abandonaba le tocaba ser el único cazador y la partida terminaba. Ahora la anfitriona asigna a mano en esa revancha, que sigue estando permitido.
- **`playtest-ui`:** fallaba de vez en cuando por dos problemas de la propia prueba:
  - reclamaba con una lectura marcada como «salto» (el GPS emulado salta 155 m de golpe), y el servidor la rechazaba con razón;
  - el reloj del móvil seguía desfasado tras un salto del reloj del servidor.

  Ninguno ocurre con el reloj real. Corregido en la prueba; 3/3 ejecuciones seguidas correctas.

**No ejecutado en esta tarea:** la comprobación del mapa real contra tu servidor. `map-view.js` no ha cambiado, y tu servidor ejecuta el motor anterior. La última comprobación correcta es la de esta mañana.

## 4. Riesgos que siguen abiertos

1. **El servidor en marcha usa el motor anterior** (arrancado el 28/10 a las 18:48): hay que **reiniciarlo**. Las páginas sí se sirven ya actualizadas. Con el motor viejo, la revancha repite equipos y el resumen no muestra los equipos de todos, sin errores.
2. **Nada físico validado:** GPS real, túnel, mapa desde el dominio del túnel, modo avión, vibración y pantalla en el bolsillo.
3. **Reconexión real sin probar.** El navegador de prueba no corta el WebSocket a `localhost`.
4. **Un evento de pista ya emitido no se puede retirar.** Si un cazador se perdió una pista por un corte y reconecta después de que capturen a un fugitivo, se le reenvía el evento original, que aún lleva la posición de ese fugitivo. La interfaz no lo muestra (filtra a los que no están libres) y la instantánea ya no lo lleva.
5. **El sorteo puede repetir los mismos equipos.** Es un sorteo, no una rotación. Si se quiere garantizar el cambio, el anfitrión asigna a mano.
6. **D-035** (captura discutida) y **D-047** (frecuencia de pistas): siguen pendientes; se observan en el playtest.

## 5. Protocolo de ensayo con dos móviles

En `ENSAYO_DOS_MOVILES.md`: 10 pasos más el paso 0 (reiniciar el servidor), con una hoja de resultados. Cada paso dice si se puede comprobar ya en el navegador (y qué prueba automática lo cubre) o si necesita los móviles.

**Lo único que se puede hacer ahora sin móviles y no se ha hecho:**
- comprobar `/health` y el mapa real desde la dirección del túnel;
- para eso necesito que me digas la dirección. No la he buscado.

## 6. Veredicto actualizado

**LISTO CON CONDICIONES.** Condiciones:
1. **Reiniciar el servidor.**
2. **Añadir la dirección del túnel a los orígenes de MapTiler** y comprobar el mapa en un móvil (si no, se juega con el radar).
3. **Hacer el ensayo con dos móviles** (pasos 1–7 y 10 correctos).
4. Seguir `PROTOCOLO_PRIMER_PLAYTEST.md`.
