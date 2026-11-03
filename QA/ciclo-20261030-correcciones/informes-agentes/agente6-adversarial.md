# Agente 6: revisión adversarial del ciclo de correcciones (30/10/2026)

## Veredicto
**No he encontrado regresiones críticas nuevas (P0 o P1).** Hay un fallo de calidad en una prueba (P2) y varios detalles menores (P3).

- No cambia ninguna regla aprobada: 30 s / 5 min, conversión, espera de 60 s, un zorro, roles públicos y finales.
- No hay fugas de información entre roles.
- La regresión de `.callout` está corregida: la cadena if/else es idéntica al respaldo, con el prefijo del zorro añadido.
- Todos los nombres que `app.js` importa de `game-view.js` existen, y la sintaxis es correcta.

## Hallazgos
| ID | Sev. | Qué pasa | Evidencia | ¿Reproducido? |
|---|---|---|---|---|
| R-1 | P2 (prueba) | En `server/test/zorro-ciclo.test.mjs` (≈ líneas 227-260, «con 3, sale el cazador/zorro…»), las aserciones con `leaver.id` no comprueban nada después de `leaver.conn.forget()`. `player().id` es `conn.playerId`, que pasa a ser `null` al olvidar la sesión. Por eso «no está en el informe», «no es invitado» y `players[leaver.id]` siempre pasan. Solo la aserción «dos zorros» detecta algo. **Arreglo:** guardar `const leaverId = leaver.id` antes de `forget()`. | Con el motor anterior, el caso «cazador» pasa. Con una traza, `players[leaver.id]` daba `undefined`. La prueba del motor equivalente (`engine/test/zorro-ciclo.test.ts`) sí falla con el motor anterior en los dos casos. | Sí |
| R-2 | P3 (texto) | V-28/C19: al convertir a un fugitivo expuesto, los cazadores reciben `runner_unexposed`. `app.js:354-356` lo muestra como «X ha vuelto a la zona: ya no se ve», justo cuando X acaba de ser infectado, así que el texto engaña. **Arreglo:** no avisar si la vista ya lo da como cazador, o añadir un motivo. | El evento sale hacia los cazadores (prueba V-28) y `app.js:354`. | No (lectura del código) |
| R-3 | P3 (interfaz) | `countdown_aborted` fija `ui.lobbyNotice` aunque el evento sea viejo (`app.js`, caso `countdown_aborted`). Al recargar, los eventos viejos se repiten (resume con `lastSeq=0` y buzón < 300). Por eso, en la sala de la revancha puede aparecer «Se ha cancelado el inicio… vuelve a pulsar Estoy listo» por algo que pasó en una partida anterior. **Arreglo:** `if (!stale) ui.lobbyNotice = text`. | `net.js` repite los eventos después de la instantánea; `notify` se silencia con `stale`, pero `lobbyNotice` no. | No |
| R-4 | P3 (prueba) | `server/test/presencia-real.test.mjs` pasa también con el `hub.ts` anterior: no detecta V-17. C6 sí queda cubierto por el bloque C6 de `server/test/regresiones-ciclo.test.mjs`, que falla con el hub anterior. | Ejecutado: 5/5 con el hub anterior. | Sí |
| R-5 | P3 (diseño) | C1 solo cubre la cuenta atrás **abortada**. Si alguien sale en una cuenta atrás que sigue adelante (4 jugadores), aparece en el informe con su rol y «left», y queda invitado a la revancha. Encaja con «abandonó», pero no con la idea de C1 de que «no jugó ninguna partida». No es una regresión. | Sonda P6: informe `a: team hunter, status left`; en la revancha queda `invited`. | Sí |
| R-6 | P3 (técnico) | **C3:** se exige que quepa el periodo de revancha entero (30 min). Con la configuración máxima de la app (60 + 5 min) no se puede empezar pasadas 4 h 25 desde que se creó la sala; con el máximo del motor (120 + 10), pasadas 3 h 20. El mensaje es claro («crea una sala nueva»). **C9:** una sala de espera solo con reconexiones se cierra a los 30 min. En una partida normal no impide jugar, pero conviene crear la sala ya en el lugar de juego. | Cálculo sobre `engine.ts:822` y las constantes. | Calculado |
| R-7 | P3 (seguridad) | **C2:** quien conozca el `installId` de otro (no se expone en vistas, eventos ni diagnóstico) puede quedarse su plaza en LOBBY si está `lobby`/`invited` y desconectada, también la del anfitrión. **C4:** al autenticar antes del límite, un acierto de secreto desde una IP bloqueada ya no se frena; con 32 bytes aleatorios es inviable. **C2:** `player_joined` con `replaces` sigue mostrando «X ha entrado» (solo estético). | Lectura de `engine.ts` (`join`) y de `hub.ts` (`uploadLocation`). | Sondas P3, P5 y P8 |
| R-8 | P3 | C6 anota `lastSeenAt` directamente sin `changes++`, así que no se guarda hasta el siguiente cambio. Ya lo hacía así `forgiveAbsence` y en partida hay cambios continuos. Efecto despreciable. | `hub.ts` (rama limitada de `seen`). | No |

## Correcciones confirmadas
Para cada una, revertí el código en una copia del scratchpad y comprobé que la prueba nueva falla.

- **Motor** (`engine/` del respaldo con las pruebas nuevas): `engine/test/regresiones-ciclo.test.ts` pasa 23/23 con el código actual. Con el código anterior pasan 7 y fallan 16: C1 (3 modos), C2 (3 de 4; la de seguridad ya pasaba antes), C3 (4), C9, C10 (3 modos) y C19 (V-27, V-28).
- **Servidor** (`hub.ts` y `main.ts` del respaldo): `server/test/regresiones-ciclo.test.mjs` pasa 13/13 con el código actual. Con el anterior, 1 pasa y 12 fallan: C4 (4), C6 (3 de 4), C7, C8 (3) y F-1.
- **net.js (C5):**
  - con el `net.js` anterior y el hub nuevo fallan «removed», «cierre 4000» y «leave pendiente de sala borrada»;
  - con el `net.js` nuevo y el hub anterior falla «el propio leave responde ok». Esto demuestra que el reordenamiento result→removed era necesario y que no se pierde el `leave` legítimo.
  - La reanudación normal sigue reenviando lo pendiente, y el cierre 4001 sin cambios.
- **Zorro (C1):** `engine/test/zorro-ciclo.test.ts` falla con el motor anterior en los dos casos de 3 jugadores.

## Sondas adversariales (`scratchpad\adversarial\cur\engine\test\adv.test.ts`, todas ejecutadas)
- **P1, C10 parcial:** el anfitrión y otro cazador caen a la vez → `hunters_abandoned`, un único `game_finished`, y el anfitrión pasa a un jugador en juego. Si solo cae uno, la partida sigue.
- **P2:** si el plazo de 5 min vence en el mismo instante que el final por tiempo, gana `time_up`. Comprobado en los 3 modos.
- **P3, C2:** un anfitrión que perdió el mando por traspaso no lo recupera al volver a entrar. El id antiguo ya no puede mandar comandos.
- **P4, C2:** con la sala llena (20), la recuperación de una plaza funciona y no supera 20.
- **P5, C2:** la asignación hecha por el anfitrión se hereda, pero el jugador sigue sin verla; no queda fantasma.
- **P8, C2:** tras 5 recuperaciones seguidas nunca hay dos plazas vivas del mismo dispositivo. `playerOrder` crece 1 por recuperación, como ya pasaba con salir y volver a entrar.
- **Ruta del hub:** `leave`, `invite`, `reconnect`, `presence` y `hostile` (pruebas antiguas) pasan con el hub nuevo.

## Información entre roles
- **C11:** `foxLine` exige `fox_hunt`, HEAD_START/ACTIVE y que quien mira sea cazador. Además, el servidor solo da el equipo del zorro tras la cuenta atrás (`view.ts`, `teamVisibleTo`). Al zorro le devuelve null.
- **C14:** la tarjeta se deduce solo de las capturas propias, que son públicas.
- **C8:** la purga reduce lo que se reenvía.
- **C6:** no emite nada nuevo.
- **C13:** el filtro del mapa solo quita puntos; no añade ninguno.

## Pruebas existentes modificadas
- `timing.test.ts`, `upload.test.mjs:87` y `map-view.test.mjs:258`: cambios justificados. En `upload.test.mjs` y `timing.test.ts` la aserción nueva es más estricta.
- `sim/panel/test/simulacion.test.mjs`: más estricta. Cambia `if (phase === 'ACTIVE')` por aserciones incondicionales.
- `package.json`: `escenarios-completos` pasa a ejecutarse aparte con concurrencia 1. No se pierde ninguna prueba.
- No se ha borrado ninguna prueba ni hay `.skip`.
- Esperas fijas: F-1 (1,5 s, justificada para un «no ocurre nada») y `escenarios-completos` (un `sleep(300)` y bucles de sondeo con límite).

## Recomendación para la validación física
- **Clásico:**
  - un cazador sale en la cuenta atrás y esta continúa: comprobar cómo sale en el informe (R-5);
  - recargar en la sala de la revancha tras una cuenta atrás abortada (R-3);
  - desconectar dos móviles a la vez más de 5 min.
- **Infección:**
  - convertir a un fugitivo expuesto y comprobar qué texto ven los cazadores (R-2);
  - recargar tras la conversión: la tarjeta debe salir una sola vez, con la espera real;
  - comprobar que el informe agrupa el contagio.
- **Zorro:**
  - comprobar que «El zorro es X» aparece solo en los cazadores tras la cuenta atrás, nunca en la cuenta atrás ni para el zorro;
  - el zorro sale en la cuenta atrás con 3 jugadores: no debe aparecer como fantasma en la siguiente partida;
  - comprobar «Ganas» y «Pierdes».
- **Todos:**
  - crear la sala en el lugar de juego (C9: 30 min sin actividad);
  - un móvil que pierde la sesión en la sala de espera vuelve a entrar con el código y recupera su plaza (C2);
  - «Salir» en la sala de espera vuelve al inicio sin mensaje de error (C5 y el reordenamiento).
