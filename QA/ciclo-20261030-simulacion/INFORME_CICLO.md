# Ciclo de consolidación, simulación y validación visual (30/10/2026)

Rama `mapa-real`, HEAD `462016d`, con cambios sin commit. **No se han hecho commits, push, despliegues ni
publicación de APK.** No se han tocado el servidor de `:8787` (PID 31160), el túnel (cloudflared, PID 31528),
la clave de MapTiler ni sus restricciones.

## 1. Estado inicial y protección del trabajo

- **Remoto:** `origin` → `github.com/aangelrvss-oss/Juego-escondite.git`. Sin stash.
- **Cambios sin commit:** 79 entradas en `git status`, que son todo el trabajo de los ciclos del 28 al 30/10.
  - 46 archivos modificados.
  - 33 sin seguimiento: `QA/`, `auditoria/`, los modos, las pruebas y `map-view.js`.
  - Es el principal riesgo: no hay ningún commit que lo proteja.
- **Copia de seguridad nueva**, antes de tocar nada: `C:\Users\aange\Downloads\outrun-respaldo-20261030-165421-antes-ciclo-simulacion\`.
  - Copia completa, con `.git` y sin `node_modules`.
  - Sin `mapa.config.json`: 0 copias de la clave.
- **Evidencias de QA anteriores:** presentes (`QA/ciclo-20261030`, `QA/playtest-20261029`, `QA/grabaciones`, `QA/registros`). No se ha sobrescrito ninguna.
- **Configuración local necesaria:** `mobile/www/mapa.config.json`.
  - Ignorado por git (`mobile/.gitignore:5`).
  - No se ha mostrado, copiado ni modificado.
- **Puertos antes de empezar:** solo estaba ocupado `127.0.0.1:8787` (node, PID 31160, `server/main.ts`). El simulador usa el **8790**, que estaba libre.
  - `server/iniciar-servidor.ps1` ya propone el 8788 como alternativa del servidor principal, así que el simulador no lo usa.
- **Memoria libre al empezar:** unos 400 MB de 6 GB. Por eso las suites de navegador se ejecutaron una a una y en primer plano.

## 2. Auditoría de integración (fase A)

Hecha por un revisor independiente, de solo lectura, contra el código y no contra los informes. Verificada después en los puntos que generan cambios.

**Lo que está bien (comprobado en el código):**
- **Conexiones:**
  - latido de 10 s y detección del cliente congelado (el pong de protocolo no cuenta);
  - aviso a los 30 s y salida a los 5 min, con el final de partida por delante si coinciden;
  - perdón tras una suspensión o un reinicio del servidor;
  - reconexión;
  - pestaña duplicada (4001 sin un «desconectado» falso ni bucles);
  - un solo socket por jugador;
  - volver después de quedar fuera (pantalla propia y revancha);
  - informe «Sin conexión».
- **Clásico:** sin cambios de reglas, salvo `rulesVersion` y el periodo de gracia aprobado.
- **Infección (§11.2):** cumple todo.
- **Caza del zorro (§11.3 y D-057):**
  - un único zorro (n−1 cazadores exactos);
  - roles públicos tras la cuenta atrás;
  - el zorro ve a los cazadores en directo;
  - los cazadores reciben la posición exacta en cada pista;
  - la captura del zorro termina la partida.
- **Fuera de alcance:** Sardines y Carrera siguen sin implementarse.

| Gravedad | Hallazgo | Decisión |
|---|---|---|
| **Importante** | `net.js`: crear o entrar sin tiempo límite. Si el socket se corta antes del `welcome`, la pantalla de inicio se queda en «Creando la sala…» hasta recargar | **Corregido**. Reproducido con una prueba que se quedaba colgada. Ahora el cierre del socket o `close()` rechazan la espera con `offline` |
| Menor (ya aprobado) | `config.ts` rechaza un intervalo de pistas igual o mayor que la duración, también en Clásico | **Sin cambios**. Lo aprobó la **D-056** («Intervalo de pistas») el 29/10: no requiere autorización nueva |
| Menor | Una pestaña sustituida antes de su primera instantánea ve el inicio sin «Jugar en esta pestaña» | Pendiente: documentado |
| Menor | La pestaña sustituida no detiene el GPS ni el bloqueo de pantalla (gasta batería) | Pendiente: documentado |
| Menor (ya existía) | «Abandonar» borra la sesión aunque `leave` falle | Pendiente: documentado |
| Menor (ya existía) | Quien abandona a mitad de partida figura como «Invitado» en la revancha | Pendiente: documentado |
| Menor | Intro en el nombre, con el código vacío, crea una sala | Pendiente: documentado |
| Mejora futura | Los errores de la pantalla de inicio se colocan junto a su campo comparando textos, en lugar de usar códigos | Pendiente |
| Mejora futura | A 320 px, el texto «4–20 jugadores» de las tarjetas de modo puede partirse en dos líneas | Pendiente |

No hay nada bloqueante. No se ha cambiado ninguna regla.

## 3. Simulación de 10 jugadores (fases B a D)

Instrucciones completas: **`sim/panel/README.md`**.

- **Arrancar:** `npm run sim:panel` (o `node sim/panel/servidor.mjs`).
- **Abrir:** **http://localhost:8790/sim/**.
- **Detener:** Ctrl+C en su ventana.

**Arquitectura.** Usa el servidor real (`startServer` con su `Hub`), el motor real y el protocolo real. Cada uno de los 10 participantes es un `GameConnection` real (`net.js`) con su propio WebSocket.
- **Bots:** nueve, o los diez si eliges «Nadie».
  - Envían lecturas de GPS y comandos (`claim_tag`, `respond_tag`, `end_game`…).
  - Esos comandos los valida el motor.
- **Interfaz real:** quien juegas tú usa la app real dentro del panel, en `/`.
  - Un guion de simulación (`shim.js`) le da la sesión, el GPS simulado y el reloj de la simulación.
- **Panel:** usa el componente de mapa real (`map-view.js`) con la misma cartografía.
  - Si no hay cartografía, usa el radar real y lo rotula como «PLANO DE PRUEBA, no es el mapa real».
  - En el área principal está el mapa.
  - Al lado, la app real con su temporizador y sus avisos.
  - Después vienen la tabla de participantes (rol, estado, conexión, última señal), las acciones, las capturas y el resultado, y la consola de eventos, con hora de juego y participante.

**Real frente a simulado:**

| Real | Simulado |
|---|---|
| Servidor y hub: WebSocket, sesiones, 4001, presencia, límites | GPS de los 10, con coordenadas sintéticas alrededor del punto de referencia de las pruebas |
| Motor, reglas y los tres modos | Decisiones de los bots |
| Capa de red del cliente (`net.js`) en los 10 | Reloj del servidor: pausa, ×2 a ×20, avances |
| App real para un participante | «Vista física» de 35 m de los cazadores bot (ver a quien está cerca, como en la calle) |
| Mapa y radar del juego; filtro de visibilidad del servidor | Señales de vida asistidas solo con el tiempo acelerado o al avanzarlo (a ×1, la presencia es la real) |

**Cambios en el código del juego para hacerlo posible** (opcionales: sin usarlos, todo funciona como antes):
- `server/main.ts`: opción `routes`, rutas HTTP extra que se consultan antes que los archivos.
- `server/hub.ts`:
  - opción `rateNow`, el reloj del límite de mensajes; por defecto, el mismo reloj de siempre;
  - `keepAliveConnected(except)`, que deja sin señal a quien está en la lista; por defecto, nadie.

**Acciones de prueba disponibles:** iniciar, pausar, reanudar, acelerar, avanzar, reiniciar, forzar desconexión, restaurar, suspender pestaña, pestaña duplicada, captura válida guiada, captura inválida, finalizar y jugar como otro participante.
- **Ninguna falsifica un resultado:**
  - la captura válida hace que un cazador camine hasta el fugitivo y la reclame;
  - el motor decide;
  - el fugitivo bot confirma.

## 4. Escenarios ejecutados

Todos con 10 participantes y AVATAR_02 en la interfaz real (sin nadie manejándola en las pruebas automáticas). Capturas en `capturas/escenario-*`; registro en `registros/09-escenarios-capturas.txt`.

| Escenario | Qué se vio | Resultado del motor |
|---|---|---|
| Clásico | 3 cazadores y 7 fugitivos asignados por el motor; huida, persecución, 9 pistas, reclamaciones confirmadas y rechazadas (`not_close_enough`) | Ganan los fugitivos por tiempo, con 6 capturas. AVATAR_02 nunca confirmó: nadie manejaba la interfaz |
| Infección | 2 cazadores iniciales; cada captura convierte («infectado: ahora caza»); espera de 60 s visible en la tabla («captura en 0:55»); tarjeta del convertido en la app | Ganan los supervivientes por tiempo, con 7 infecciones (AVATAR_02 sobrevivió por el mismo motivo) |
| Caza del zorro | Un único zorro; roles públicos; «Lo que ve el zorro» muestra a los 9 cazadores en directo (filtro real); los cazadores rodean la pista | Zorro atrapado: ganan los cazadores |

Además, sin navegador (`sim/panel/test`):
- los tres modos completos;
- desconexión → 30 s → «sin conexión» → vuelve; y sin volver, fuera a los 5 min;
- pestaña suspendida;
- pestaña duplicada (4001);
- captura inválida rechazada y captura válida confirmada;
- conversión con 60 s de espera;
- un único zorro que ve a los cazadores;
- pausa;
- finalizar;
- reinicio sin restos;
- sesión solo para quien juega desde la interfaz;
- aislamiento.

## 5. Pruebas (resultados reales, registros en `registros/`)

| Suite | Resultado |
|---|---|
| `tsc` | OK (`01-typecheck.txt`) |
| Motor + sim | 209/209 |
| Servidor | **93/93** (90 + 3 nuevas: `rateNow`, `keepAliveConnected(except)`, `routes`) |
| Cliente | **127/127** (126 + 1 nueva: crear o entrar con el socket cortado) |
| Demo | 62/62 |
| Simulador, sin navegador (14 pruebas) | 14/14 en **3 ejecuciones seguidas** con el código final (`06-simulador-1..3.txt`) |
| Simulador en Chromium, a 1280 y 360 px (9 comprobaciones) | 9/9 en 4 ejecuciones (`07-e2e-simulador-1..4.txt`; la 4.ª con los bots definitivos) |
| e2e `game` | 8/8 |
| e2e `layout` | 6/6 |
| e2e `map` | 29/29 |
| e2e `playtest-ui` | 13/13 |
| e2e `conexion` | 10/10 |
| e2e `infeccion` | 8/8 |
| e2e `zorro` | 6/6 |
| e2e `inicio` | 13/13 |
| e2e `web-flow` | **1.ª ejecución: 31/32** (tiempo agotado en «empezar la revancha»). Las 3 siguientes: 42/42 |

**Sobre el fallo de `web-flow`** (`08-e2e-web-flow.txt` frente a `-rep2..4`):
- Ocurrió en 1 de 4 ejecuciones, en un paso que no usa el código cambiado en este ciclo.
- Ese paso pulsa «Estoy listo» en tres páginas y espera 8 s a que se active «Empezar».
- La interfaz redibuja con `innerHTML`, así que es probable que un clic cayera sobre un botón sustituido en ese momento. Se ejecutó con poca memoria libre.
- Clasificación: **intermitente de la prueba o del entorno, no confirmado como fallo del juego**. Queda abierto (§7).

**Fallos del simulador encontrados y corregidos durante el ciclo:**
- **Reiniciar cortaba la petición del panel** que lo pedía («Failed to fetch»). Ahora «Iniciar» y «Reiniciar» responden antes de ejecutarse.
- **El mapa del panel salía vacío:** la hoja de MapLibre anulaba la posición del lienzo.
- **Los bots insistían en reclamar** al mismo fugitivo sin respuesta.
- **«Avanzar» daba pasos de 5 s** sin esperar a los mensajes en curso: aparecían lecturas «antiguas» y reclamaciones caducadas. Ahora cada paso espera, y hay una prueba de regresión.
- **El zorro bot nunca era capturado:** el umbral de reclamación estaba mal elegido y faltaba la vista física.

## 6. Archivos

- **Nuevos:**
  - `sim/panel/servidor.mjs`, `sim/panel/simulacion.mjs`;
  - `sim/panel/www/index.html`, `panel.js`, `panel.css`, `shim.js`;
  - `sim/panel/README.md`;
  - `sim/panel/test/simulacion.test.mjs`;
  - `server/test/sim-hooks.test.mjs`;
  - `mobile/e2e/simulador.e2e.mjs`;
  - esta carpeta de QA.
- **Modificados:**
  - `server/main.ts` (`routes`);
  - `server/hub.ts` (`rateNow`, `keepAliveConnected(except)`);
  - `mobile/www/js/net.js` (rechazar crear o entrar si se corta);
  - `mobile/test/game.test.mjs` (+1 prueba);
  - `package.json` (`sim:panel`, `test:sim-panel`).

## 7. Incidencias pendientes

- **Intermitente:** `web-flow`, en el paso «empezar la revancha», falló 1 de cada 4 ejecuciones. Hay que medirlo más veces con memoria libre, y si se repite, hacer que la prueba espere a que el botón sea estable.
- **Hallazgos menores de la auditoría** (§2): pendientes de tu decisión. Ninguno cambia reglas.
- **Simulador:**
  - una sola interfaz real a la vez;
  - desconectar o suspender a quien juegas en la interfaz se hace desde el navegador;
  - con el tiempo acelerado, las señales de vida son asistidas;
  - el GPS no tiene ruido ni pérdidas;
  - las etiquetas del mapa se solapan cuando varios participantes están juntos.
- **Sin validación física:** cambio de pestaña y pantalla bloqueada en Android e iOS, modo avión de 60 s y de 6 min, Infección y Caza del zorro en la calle, pantalla de inicio en un móvil real.
- **Servidor de `:8787`:** sigue con el código anterior al ciclo del 30/10. No se ha reiniciado (no autorizado). El mapa real con el código nuevo no se ha comprobado a través del túnel.

## 8. Capturas

En `capturas/`:
- `escenario-classic-*`, `escenario-infection-*`, `escenario-fox_hunt-*`: con el mapa real de MapTiler, por `localhost:8790`.
- `simulador-*`: con el plano de prueba y a 360 px.

No contienen la clave: solo la atribución del proveedor.
