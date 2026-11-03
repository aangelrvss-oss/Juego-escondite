# Matriz de pruebas · validación de modos (30/10/2026)

**Leyenda del estado:**
- **OK:** ejecutado en este ciclo y correcto.
- **Fallo:** fallo reproducido; las referencias V-xx remiten a `INFORME_AUDITORIA_MODOS.md` §6.
- **Lectura:** solo comprobado leyendo el código.
- **Hueco:** sin prueba.

**Leyenda de la fuente:**
- **R:** registro de este ciclo, en `registros/`.
- **E:** prueba del repositorio, que ha pasado en este ciclo.

Las matrices completas de cada agente están en `informes-agentes/`:
- Infección: 25 casos (agente 3);
- Caza del zorro: 44 casos (agente 4).

## Comunes
| Caso | Fuente | Estado |
|---|---|---|
| Versión de reglas por modo | R21 (las tres); E `modes.test` | OK |
| Comando rechazado sin efecto | E motor | OK |
| «Sin conexión» a 30 s; de vuelta, «ha vuelto» | R04 (simulador); E `presence.test` | OK. Con el matiz V-17: hasta 5 s antes |
| Fuera a los 5 min, como abandono; el espectador no queda fuera | R04, R12 (SIM-INF-05, 06 y 08); E `presence.test.ts` | OK |
| Final por tiempo antes que la salida a los 5 min | R10 (A1-4) | OK |
| Pestaña duplicada (4001) y pestaña suspendida | R04 | OK |
| Reconexión: instantánea filtrada y eventos sin repetir | E `conexion` (ciclo anterior); R21 sin fugas | OK, solo en simulación |
| Dos reclamaciones simultáneas sobre el mismo fugitivo | E `capture.test.ts:116`, `capture-race.test.mjs:48` | OK. El fallo de SIM-INF-04 es un artefacto del escenario |
| Captura inválida rechazada sin cambiar el estado | R21 (los tres modos, en las dos partidas) | OK |
| Un solo `game_finished` por cliente | R21 (2 × 10 clientes × 3 modos) | OK |
| Revancha sin estado heredado al empezar | R21; R12 (SIM-INF-09) | OK. En la sala quedan restos, sin efecto (V-27) |
| Sin fugas de posiciones (lo recibido por cada cliente) | R20, R21 (~45 000 elementos) | OK |
| Fugitivo sin GPS válido | R14, R16 | **Fallo V-01** |
| Sondeo con reclamaciones | R16 (a6-02) | **Fallo V-02** |
| Elegir el propio rol | R10, R14 | **Fallo V-03** |
| Salir en la cuenta atrás que se aborta | R14, R16 | **Fallo V-04** |
| Volver a la revancha tras abandonar; `welcome` perdido | R15, R16 | **Fallo V-05** |
| Partida que cruza las 6 h de la sala | R16 | **Fallo V-06** |
| `/api/loc` con fallos ajenos en la misma IP | R16 | **Fallo V-07** |
| Suspensión del servidor de 30–60 s | R15 | No reproducido (V-31) |
| Reloj del servidor que retrocede | — | Hueco (V-30) |

## Clásico (10 jugadores en simulación; mínimo en las pruebas del motor)
| Caso | Fuente | Estado |
|---|---|---|
| `ceil(n/4)` cazadores (3 con 10) | R21; E motor | OK |
| Persecución, capturas, espectador con retraso | R21 (7 capturas × 2 partidas) | OK |
| Periodo de gracia | R04; E `presence` | OK |
| Victoria por captura total | R21 | OK |
| Victoria por tiempo | E motor; ciclo anterior (simulación) | OK, en el motor |
| Revancha con sorteo nuevo | R21 | OK |
| Sin textos de otros modos | Lectura (agente 5) | Lectura: correcto |

## Infección
| Caso | Fuente | Estado |
|---|---|---|
| Mínimo de 4; con 3 no empieza | E `infection.test`; R11 | OK |
| `max(1, floor(n/4))` exactos, de n=4 a 20, con `start` real | R10, R11 | OK |
| Asignación manual que no cuadra → `teams_unbalanced` | R11 | OK |
| Captura → conversión en el mismo paso, sin doble rol | R11, R12, R21 | OK |
| Espera de 60 s: 59 999 ms se rechaza y 60 000 ms se acepta; la reconexión no la cambia | R10 (A1-3), R11 | OK |
| Autodeclaración que nombra a un convertido en su espera → sin autor | R12 (SIM-INF-03) | OK, conforme a la regla |
| Sin la pista anterior a la conversión | R11; E | OK |
| Convertido sin conexión 30 s; vuelve; otro queda fuera a los 5 min | R12 (SIM-INF-05) | OK |
| Último fugitivo fuera a los 5 min → sin ganador | R12 (SIM-INF-06) | OK |
| Se van los cazadores iniciales y queda un convertido: sigue; si se va él, sin ganador | R12 (SIM-INF-08) | OK |
| Todos infectados → ganan los cazadores | R12 (SIM-INF-07), R21 | OK |
| Tiempo agotado → ganan los supervivientes | R12 (SIM-INF-10) | OK |
| Tarjeta del convertido y espera visible en la interfaz | R31 (e2e, capturas 02 y 03) | OK |
| Tarjeta tras reconectar más de 15 s después | R11 | **Fallo V-12** |
| Mapa del convertido en los primeros 5 s | R16 (a6-10) | **Fallo V-11** |
| Cadena de contagio completa | R11 | **Fallo V-08** |
| Último superviviente | R31; lectura | OK, si caen todos |
| Salida en la cuenta atrás: cazadores exactos | R11, R16 | **Fallo V-20** (pendiente de decisión) |
| Revancha | R12 (SIM-INF-09), R21 | OK |

## Caza del zorro
| Caso | Fuente | Estado |
|---|---|---|
| Mínimo de 3; con 2 no empieza; con menos de 3 en la cuenta atrás, vuelve a la sala | E `fox-hunt.test` | OK |
| Un único zorro: sorteo, manual, revancha y `swapRoles` | R20, R21; E | OK |
| Roles ocultos en la cuenta atrás y públicos después (servidor) | E `fox-hunt` (motor y servidor), R30 | OK |
| La interfaz nombra al zorro en la huida | Lectura | **Fallo V-09** |
| El zorro ve a los cazadores activos (lo que recibe por la red) | R20, R21; R30 (captura 03) | OK |
| Los cazadores no ven al zorro en directo salvo si está expuesto | R20, R21 | OK |
| La pista: una entrada, el zorro, solo a cazadores | R20, R21; R30 (captura 04) | OK |
| La captura termina la partida una vez | R20, R21 | OK |
| Tiempo agotado → gana el zorro; zorro sin señal 5 min → sin ganador | E motor; R14 | OK |
| Zorro sin GPS o sin precisión | R14 | **Fallo V-01** |
| El anfitrión zorro termina la partida | R14 | V-10 (decisión) |
| Informe tras salir en la cuenta atrás | R14 | **Fallo V-04** |
| Tamaños 3–4 | E motor y servidor; R14 (repros con 3–4) | OK en el motor y el servidor; sin navegador |

## Interfaz (navegador, este ciclo)
| Suite | Resultado |
|---|---|
| `zorro.e2e.mjs` | 6/6 (R30, `capturas/zorro/`) |
| `infeccion.e2e.mjs` | 8/8 (R31, `capturas/infeccion/`) |
| Otras suites e2e y panel del simulador | **No ejecutadas en este ciclo**, por memoria; los antecedentes están en el ciclo anterior |

## Pruebas que faltan (se añaden con las correcciones autorizadas)
- **Infección:** el límite exacto de la espera, ya probado en R10 y R11, pasará al repositorio.
- **Presencia:**
  - con pings reales cada 10 s, sin `keepAliveConnected`;
  - ningún final de ganador por `hunters_abandoned` o `runners_abandoned` en Infección y en el zorro con el servidor real.
- **Barrido de fugas en el repositorio:** el script R21, adaptado como prueba.
- **Sala y conexión:** cuenta atrás abortada y partida siguiente; revancha tras abandonar; `welcome` perdido; vida de la sala; `/api/loc` con fallos ajenos; `cmd` nulo.
- **Interfaz:** nombre del zorro en la huida; tarjeta tras reconectar; posiciones al cambiar de rol; cadena de contagio con ramas.
