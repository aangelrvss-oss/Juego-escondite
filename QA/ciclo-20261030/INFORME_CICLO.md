# THE OUTRUN · Informe del ciclo «estabilidad + modos + inicio» · 30/10/2026

## 1. Estado inicial
- Rama `mapa-real`, HEAD `462016d`, 51 entradas sin commit.
- **Respaldo:** `C:\Users\aange\Downloads\outrun-respaldo-20261030-004854-antes-ciclo-modos\` (275 archivos y el diff, sin `mapa.config.json`).
- **Línea base de pruebas:**

| Suite | Resultado |
|---|---|
| Motor + simulación | 157/157 |
| Servidor | 78/78 |
| Cliente | 117/117 |

## 2. Agentes
| Agente | Papel |
|---|---|
| A | Arquitectura y motor |
| B | QA multijugador, con reproducciones en un servidor propio |
| C | Diseño de modos |
| D | Pantalla de inicio, con maquetas |
| E | Revisor de la auditoría |
| Revisor independiente 1 | Estabilidad + Infección |
| Revisor independiente 2 | Caza del zorro |

Todos trabajaron en solo lectura; la implementación la hizo la sesión principal. La auditoría está en `INFORME_AUDITORIA.md`.

## 3. Diagnóstico de la conexión

### Causas confirmadas, reproducidas con un servidor propio
1. **La misma partida abierta en otra pestaña o ventana del mismo navegador** (p. ej., al volver a abrir el enlace o el QR):
   - el servidor cierra la anterior (4001);
   - esa pestaña se quedaba en «Desconectado» para siempre, con un aviso que mandaba al inicio pero sin botón;
   - «Abandonar» se colgaba.

   Es la explicación más probable de «cambia de pestaña y sale de la partida».
2. **Durante la partida nadie veía que otro había perdido la conexión:** el evento llegaba, pero no se mostraba.
3. **No había periodo de gracia:** un desconectado seguía activo para siempre. Era incapturable y podía «ganar» como superviviente.
4. **Doble conexión al volver a primer plano,** con avisos de conexión duplicados.
5. **Una página congelada seguía «conectada» para el servidor:** el navegador contesta los ping de la red.
6. **El cazador perdía «Esperando a que X confirme» al recargar.**

### Lo que funcionaba (verificado)
- La salida voluntaria avisa a todos.
- Recargar la página recupera la partida.
- Un corte de 7 min se recupera sin duplicados.
- La captura rechazada funciona.

### Hipótesis sin confirmar (necesitan móviles)
- El navegador integrado de WhatsApp o Instagram, con un almacenamiento distinto.
- El cambio de dirección del túnel.
- Que Android descarte la pestaña.

## 4. Política de reconexión implementada (D-057)
| Momento | Qué pasa |
|---|---|
| Señal de vida | Cualquier mensaje de la aplicación (ping cada 10 s, lecturas, comandos) o una lectura nativa por HTTP. No cuentan los ping de la red |
| A los 30 s sin señal (huida o persecución) | Todos ven «Sin conexión: X» y el aviso «X no da señales»; al volver, «X ha vuelto». Sin equipo, posición ni hora |
| Antes de 5 min | Recupera la sesión con su rol, capturas, pista y reclamación pendiente. El servidor manda |
| A los 5 min sin señal | Queda fuera como si hubiera abandonado: se cancelan sus reclamaciones y sale de la pista. Si su equipo queda vacío, termina sin ganador. Todos reciben «X ha quedado fuera: más de 5 min sin conexión» |
| Si vuelve tarde | Pantalla «Estás fuera de la partida», con el motivo. Recibe el final (informe: «Sin conexión») y la revancha |
| Excepciones | El capturado no queda fuera. Si coincide con el final, el final va antes. Tras reiniciar el servidor o detectar una suspensión, el plazo empieza de cero |
| Otra pestaña | «La partida está abierta en otra pestaña» con «Jugar en esta pestaña» (manual, sin bucles). Los comandos ya no se cuelgan |
| Sin duplicados | Un solo socket; el aviso de conexión no se repite si ya estaba conectado; idempotencia de comandos (ya existía) |

**Reglas de captura y de victoria:** no cambian. El abandono por periodo de gracia usa la regla de abandono que ya existía.

## 5. Modos (reglas definitivas en `docs/product/GAME_MODES_AND_RULES.md` §11)
- **Clásico:** sin cambios de comportamiento. Versión de reglas `clasico/2026-10-30`, por el periodo de gracia.
- **Infección (completo):**
  - 4 jugadores o más;
  - `max(1, floor(n/4))` cazadores;
  - conversión al confirmar la captura;
  - 60 s sin capturar;
  - sin la pista anterior;
  - los convertidos ganan con los cazadores;
  - cadena de contagio y último superviviente.
- **Caza del zorro, «Mr. X» (completo):**
  - 3 jugadores o más;
  - un zorro;
  - el zorro ve a los cazadores en directo;
  - los cazadores reciben su posición en cada pista;
  - una captura termina la partida.
- **Sardines:** aplazado (D-057).
- **Arquitectura:** `engine/src/modes.ts` es una tabla de reglas por modo (cazadores al empezar, mínimo, qué pasa al capturar, si el fugitivo ve a los cazadores). Fases, plazos, captura, pistas y reconexión siguen siendo comunes. Sin sistema de complementos.

## 6. Pantalla de inicio
- **Dirección «señal en la noche»:**
  - logotipo oficial (`lockup()`);
  - fondo de retícula urbana solo con CSS;
  - lema grande en cursiva;
  - naranja solo para la señal y la acción;
  - fuentes del sistema.
- **Modos:** solo los jugables, seleccionables, con icono, color, número de jugadores, descripción y «Reglas de X» (hoja). El modo elegido pasa a la sala.
- **Estados:**
  - creando o entrando, con los botones bloqueados (dos toques = una sala);
  - sin internet;
  - el servidor no responde;
  - errores junto a su campo (`role=alert`, `aria-invalid`);
  - «Recuperando tu partida…».
- **Invitación:** un solo botón principal («Unirme»); crear queda como enlace secundario. Se puede pegar el enlace entero en el código.
- **Escritorio:** dos columnas, con la tarjeta de acción fija.
- **Movimiento:** discreto, y ninguno con «reducir movimiento».
- **Capturas:** `capturas/inicio/`.
- **Límite conocido:** a 360×740, en la primera visita (con la casilla de edad), «Crear partida» termina a 772 px, así que hace falta desplazar un poco. Un jugador que vuelve no ve la casilla y lo tiene a la vista.

## 7. Archivos modificados en este ciclo
- **Motor:**
  - `engine/src/`: `engine.ts`, `view.ts`, `types.ts`, `constants.ts`, `config.ts`, `validate.ts`, `teams.ts`;
  - nuevo: `modes.ts`.
- **Servidor:** `server/hub.ts`.
- **Cliente:** `mobile/www/js/`: `net.js`, `app.js`, `game-view.js`; `mobile/www/css/game.css`.
- **Pruebas nuevas:**
  - `engine/test/`: `presence.test.ts`, `infection.test.ts`, `fox-hunt.test.ts`;
  - `server/test/`: `presence.test.mjs`, `infection.test.mjs`, `fox-hunt.test.mjs`;
  - `mobile/test/modes.test.mjs`;
  - `mobile/e2e/`: `conexion.e2e.mjs`, `infeccion.e2e.mjs`, `zorro.e2e.mjs`, `inicio.e2e.mjs`.
- **Pruebas adaptadas:**
  - Arneses (`engine/test/helpers.ts`, `server/test/helpers.mjs` y los saltos de reloj de los e2e): los jugadores conectados dan señales de vida durante los saltos, como en la realidad.
  - Reescritas por el cambio de regla D-057:
    - `timing.test.ts` (tick tardío);
    - `transitions.test.ts` (AC-C8);
    - `sim/test/resilience.test.ts`;
    - `lobby-status.test.mjs` (texto del aviso);
    - `briefing.test.mjs` (apartado «Modo»);
    - `visibility.test.ts` (audiencia de la pista);
    - `playtest-ui.e2e.mjs` (salir tras el final ya no es «abandonó»).
- **Documentación:**
  - `DECISION_LOG.md` (D-057);
  - `GAME_MODES_AND_RULES.md` (§11 y nota en §3);
  - `GAME_STATE_MACHINE.md` (§5.2);
  - `ACCEPTANCE_CRITERIA.md` (AC-C8);
  - `DECISIONES_PENDIENTES.md` (D-045);
  - este informe y `INFORME_AUDITORIA.md`.
- **Sin cambios:** `map-view.js` (idéntico al respaldo), `index.html`, `mapa.config.json`, la configuración de MapTiler y el servidor de `:8787`.

## 8. Pruebas ejecutadas (resultado final; registros en `registros/final-*`)
| Prueba | Resultado |
|---|---|
| TypeScript | OK |
| Motor + simulación | **209/209** (+52) |
| Servidor | **90/90** (+12) |
| Cliente | **126/126** (+9) |
| Demo | 62/62 |
| `game` (5 navegadores) | 8/8 |
| `layout` | 6/6 |
| `map` (cartografía de prueba) | 29/29 |
| `playtest-ui` | 13/13 |
| `web-flow` | 42/42 |
| `conexion` (nueva) | 10/10, también 3 de 3 ejecuciones seguidas |
| `infeccion` (nueva) | 8/8; 3 ejecuciones finales correctas tras la corrección (antes fallaba 2 de cada ~15) |
| `zorro` (nueva) | 6/6 |
| `inicio` (nueva, 360 y 1280 px) | 13/13 |
| Búsqueda de la clave en evidencias | 0 apariciones |

**Fallos encontrados y corregidos, no ocultos:**
- **Fallos de las propias pruebas, no del juego:**
  - los saltos de reloj dejaban a los jugadores sin señales;
  - un aviso tapado por otro en pantalla;
  - posiciones que no llegaban porque el reloj de la prueba no avanzaba;
  - lecturas GPS inestables en `infeccion`.
- **Hallazgos de los dos revisores independientes:** todos corregidos salvo dos, que quedan documentados en el §9 (APK antigua y cazador desconectado visto por el zorro). Los de reglas tienen prueba; los cambios de texto se comprueban en parte con las pruebas de cliente y de Chrome. Por ejemplo:
  - un convertido podía recibir la pista emitida en el mismo paso;
  - salir tras el final aparecía como «abandonó»;
  - la suspensión del servidor solo se detectaba en el despertador;
  - textos de Clásico en el modo zorro.
- **Interrupción:** una regresión en segundo plano se cortó por falta de memoria del equipo. Se repitió entera en primer plano.

## 9. Problemas conocidos
1. **APK antigua:** una APK compilada antes de este ciclo:
   - ve las partidas de Infección o del zorro con textos de Clásico;
   - si es la del anfitrión, al reconfigurar devuelve la sala a Clásico sin avisar.

   Hay que recompilar la APK. El servidor no comprueba la versión del cliente.
2. **Navegador con la pantalla bloqueada:**
   - deja de dar señales: a los 30 s sale «sin conexión» y a los 5 min queda fuera. Es lo aprobado, pero conviene avisar a los jugadores.
   - La app nativa da señal con cada lectura de GPS. Sin GPS (bajo techo) y con la interfaz dormida, también quedaría fuera.
3. **El zorro ve la última posición conocida de un cazador desconectado,** con su antigüedad. Es lo mismo que pasa con los compañeros en Clásico.
4. **En pantalla solo cabe un aviso a la vez:** el de una pista puede tapar otro que llegue en el mismo instante. «Ha quedado fuera» tiene la máxima prioridad.
5. **A 360×740, «Crear partida»** requiere un pequeño desplazamiento en la primera visita.

## 10. Pendiente de aprobación
- **Sardines:** reglas completas (propuesta del agente C en la auditoría).
- **Parámetros que siguen siendo hipótesis** (D-038): 30 s / 5 min (aprobados para probar), 60 s del convertido y mínimos de jugadores. Se ajustan con datos del campo.

## 11. Pruebas físicas pendientes (nada de esto se ha probado con móviles)
- **Cambio de pestaña o app:** Android Chrome e iOS Safari, 10 s / 1 min / 6 min; pantalla bloqueada en el bolsillo, para ver cuándo sale «sin conexión».
- **Enlace de WhatsApp:** abrirlo dos veces (Custom Tab y Chrome) y comprobar que aparece «Jugar en esta pestaña».
- **Modo avión:** 60 s (debe volver) y 6 min (debe quedar fuera, con la pantalla que lo explica).
- **Captura rechazada en la calle**, con «No»: los dos ven «Captura rechazada».
- **Infección con 4 o más personas:** conversión, espera de 1 min e informe.
- **Caza del zorro con 3 o más:** el zorro ve a los cazadores y se comprueban el ritmo, la seguridad y que no incite a correr.
- **Pantalla de inicio en un móvil real** (con la barra del navegador): crear, unirse por QR y por enlace pegado.
- **Mapa real con el servidor nuevo:** no se ha comprobado en este ciclo, porque el servidor de `:8787` sigue con la versión anterior. Hay que reiniciarlo y volver a comprobar el mapa desde el túnel (`map-view.js` no ha cambiado).

## 12. Confirmaciones
- **Sin commits, push ni despliegues.**
- **Sin tocar:** el servidor de `:8787`, el túnel, la clave de MapTiler ni sus restricciones.
- **Sin borrar** evidencias ni archivos locales.
