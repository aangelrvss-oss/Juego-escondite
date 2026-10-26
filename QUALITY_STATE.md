# Estado de calidad

**Última actualización:** 26/10/2026 (F1 motor seguro, H2 multijugador y preparación de la prueba real en Android; sin commit)

## Resumen

| Tipo de prueba | Estado |
|---|---|
| Pruebas automatizadas del motor y de la simulación | **103 de 103** el 24/10/2026 (2 ejecuciones idénticas); **112 de 112** tras D-042 (25/10/2026); **130 de 130** con F1 (26/10/2026). Todas son **SIMULADAS** |
| Servidor multijugador real (H2) | **19 de 19** (`npm run test:server`), incluido el envío de ubicación por HTTP y el ping de protocolo. Clientes reales por WebSocket y HTTP en un ordenador; reloj y ubicaciones **SIMULADOS** |
| Interfaz de partida con 5 navegadores (H2) | **8 de 8 etapas** (`mobile/e2e/game.e2e.mjs`). Chromium con geolocalización **emulada**; **no son móviles** |
| Verificación por mutación (3 invariantes de seguridad) | Las 3 mutaciones las detecta al menos una prueba |
| Pruebas en dispositivos reales | **Una sesión corta de H1 en un Xiaomi 14T** (ver «H1» al final). El resto de pruebas físicas siguen **pendientes**: S1–S3, la lista de H1 y la partida con dos móviles (`mobile/PRUEBA_PARTIDA_ANDROID.md`, preparada y **no realizada**) |
| Transporte de red real (WebSocket), latencia y cobertura móvil | WebSocket real **probado en local** (mismo ordenador). **No probado** desde redes distintas, ni con latencia o cobertura móvil reales |
| Ubicación en segundo plano, GPS real, notificaciones y batería | **Evidencia preliminar en Android:** en esa sesión corta se recibieron posiciones con la pantalla apagada. **No validados:** sesión larga, caminando, mala señal, batería ni iOS |

**Qué demuestra S0:** que las reglas del modo Clásico, la autoridad del servidor, el filtrado de datos por equipo, la validación de capturas, la reanudación y la idempotencia funcionan según lo documentado **en un entorno simulado y determinista**.
**Qué no demuestra:** nada sobre GPS real, móviles bloqueados, redes móviles, latencias reales, consumo de batería ni el rendimiento del servidor en producción.

## Cómo reproducirlo

Requisitos: Node ≥ 22.18 (probado con 22.22.0) y npm 10.

```
npm install --ignore-scripts      # 2 dependencias de desarrollo: typescript 5.9.3 y @types/node 22.19.1
npm run typecheck                 # tsc -p tsconfig.json (sin emitir)
npm test                          # node --test "engine/test/*.test.ts" "sim/test/*.test.ts"
```

**Resultado registrado (24/10/2026, contenedor Linux):**
- `npm run typecheck`: código de salida 0, sin errores.
- `npm test`, ejecución 1: `tests 103 · suites 26 · pass 103 · fail 0 · cancelled 0 · skipped 0`, 40,6 s.
- `npm test`, ejecución 2: mismo resultado, 40,2 s.

**Fallos durante el desarrollo, y su causa.** Ninguno fue un fallo del motor:
1. La prueba del "tick tardío" saltaba 60 min y la ventana de revancha (30 min) cerraba la sala, que es lo correcto. Se ajustó el salto a 15 min.
2. La prueba de reordenación ignoraba que el cliente arranca con una instantánea que ya cubre el evento 1. Se corrigió la expectativa.
3. En el escenario, el bot que debía salir de la zona no llegaba a hacerlo (recorría 180 m con el borde a más de 300 m). Se corrigió el bot: la prueba no estaba probando nada.
4. La medición de volumen dividía entre todos los jugadores, aunque los capturados dejan de enviar. Ahora se divide por tiempo de jugador activo.

Además, antes de ejecutar las pruebas se detectó y corrigió un **fallo de diseño**: el `seq` único por sala era incompatible con el filtrado por destinatario (D-020).

## Trazabilidad con los criterios de aceptación

Leyenda: ✅ superado en simulación · ◐ parcialmente (la parte del servidor sí; falta la del dispositivo o la interfaz) · ⬜ no probado

| Criterio | Estado | Prueba o motivo |
|---|---|---|
| AC-A1 (18+ y nombre) | ◐ | Validación del nombre (2–20) probada. La declaración de edad es de interfaz |
| AC-A2 (código y caducidad) | ✅ | `host.test` (formato, alfabeto, no reutilización) y `transitions.test` (30 min) |
| AC-A3 (límite de intentos) | ✅ | `host.test` |
| AC-A4 (no entrar a una partida empezada) | ✅ | `transitions.test` |
| AC-A5, AC-A6 (enlace y QR) | ⬜ | Requieren app y dispositivo |
| AC-A7 (expulsión) | ✅ | `transitions.test` |
| AC-B1, AC-B2 (configuración y seguridad previa) | ✅ | `transitions.test` |
| AC-B3, AC-B4 (avisos de interfaz) | ⬜ | Interfaz |
| AC-C1 a AC-C8 (autoridad, tiempo, idempotencia, `seq`, resultado, anfitrión, todos desconectados) | ✅ | `transitions.test`, `timing.test`, `host.test` y `resilience.test`. **AC-C3 solo con latencia simulada 0** |
| AC-D1, AC-D2, AC-D3 (aislamiento por equipo) | ✅ | `visibility.test` y `simulation.test` (invariantes en 15 partidas completas de 2, 10 y 20 jugadores) |
| AC-D4, AC-D5 (antigüedad, muestras tardías) | ✅ | `visibility.test` y `timing.test` |
| AC-D6 (dejar de compartir al terminar) | ◐ | El servidor borra las muestras y deja de enviar. Que el cliente deje de enviar en 10 s o menos requiere dispositivo |
| AC-D7 (logs sin coordenadas) | ✅ | `host.test` (partida completa) |
| AC-D8, AC-D9 (móvil bloqueado, permiso revocado) | ⬜ | **Requieren dispositivos reales (S1–S3)** |
| AC-E1 a AC-E7 (capturas) | ✅ | `capture.test` |
| AC-F1 (resincronizar tras 60 s) | ◐ | Lógica de reanudación probada en simulación. El objetivo de 10 s o menos requiere red real |
| AC-F2 (cierre forzado) | ◐ | Reanudación por instantánea probada. El cierre real de la app requiere dispositivo |
| AC-F3 (abandono) | ✅ | `transitions.test` |
| AC-G1 (resultados sin coordenadas) | ◐ | Los datos de `game_finished` no llevan coordenadas. La pantalla es de interfaz |
| AC-G2, AC-G3 (revancha sin datos previos) | ✅ | `transitions.test` y `host.test` |
| AC-H1 a AC-H4 (no funcionales) | ⬜ | Requieren dispositivo y red real |

## Trazabilidad con el plan de la prueba técnica (T01–T13)

| ID | Estado S0 | Nota |
|---|---|---|
| T03 (visibilidad autorizada) | ✅ simulado | **Hay que repetirlo** con el adaptador real en S1 |
| T09 (autoridad del tiempo) | ✅ simulado | Desfase de ±10 min con y sin sincronizar |
| T10 (comandos maliciosos) | ✅ simulado | `end_game` sin ser anfitrión, transiciones, capturas lejanas, antiguas, repetidas, autoconfirmadas, sesión falsa, comandos de sistema |
| T13 (volumen de mensajes) | ✅ simulado | Ver la tabla siguiente |
| T01, T02, T04–T08, T11, T12 | ⬜ | Requieren dispositivo y red real |

**T13: volumen medido en simulación** (semilla 41, envío de ubicación cada 5 s, posiciones agrupadas por destinatario):

| Jugadores | Tiempo en juego | Capturas | Subida por jugador activo y hora | Bajada por jugador y hora |
|---|---|---|---|---|
| 2 | 7 min | 1 | ~761 | ~128 |
| 10 | 17 min | 7 | ~752 | ~871 |
| 20 | 22 min | 14 | ~753 | ~955 |

La subida coincide con el modelo (720 posiciones por hora más comandos). La bajada queda **por encima** de los 720 por hora supuestos en `TECHNICAL_SPIKE_PLAN.md` §5 cuando hay equipos, porque incluye los eventos de juego además de las posiciones. Son cifras **SIMULADAS**: los bots no reproducen el comportamiento real de jugadores ni de redes.

## Limitaciones conocidas de S0

- La latencia de red es 0, no hay pérdida de paquetes salvo la inyectada, y los relojes se sincronizan de forma exacta.
- No hay WebSocket ni adaptador real (Durable Objects o Node). La serialización de comandos por partida la garantiza el servidor simulado, no una plataforma real.
- Los bots siguen reglas simples (paseo aleatorio, persecución hacia la última pista) y confirman con honestidad.
- El motor clona el estado completo en cada comando (`structuredClone`). Es suficiente para el MVP en simulación, pero **su coste de CPU con 20 jugadores en un adaptador real no se ha medido**.
- La zona que se reduce o se desplaza: solo se ha probado la geometría de la estructura versionada. Sus reglas de juego no existen (fuera del MVP). ⚠ *Sesión 4: el propietario ha definido la zona dinámica y se propone incluirla en el MVP (D-030). Sus reglas están en `docs/product/GAME_MODES_AND_RULES.md` §6, todavía sin implementar ni probar.*
- El filtro de palabras ofensivas de los nombres no está implementado (pendiente).

## Calidad de la investigación (sesiones anteriores)

- **Fase 0:** ver las limitaciones en `docs/research/COMPETITIVE_ANALYSIS.md` (muestra pequeña de reseñas, sin Reddit ni audio del vídeo).
- **Sesión 2:** las verificaciones técnicas y de precios vienen de fragmentos de resultados de búsqueda (WebFetch no resuelve DNS en el contenedor). Contradicción abierta: si Durable Objects está o no en el plan gratuito de Cloudflare.

## Plantilla para resultados de S1 en adelante

| ID | Fecha | Dispositivo / SO | Variante | Red | REAL / SIMULADO | Medido | Resultado | Observaciones |
|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | — |

## S1: prueba de ubicación en Android (sesión 5)

**Qué hay:** el núcleo Java (`android/core`), que se ha probado, y la app (`android/app`), que se ha **escrito pero no compilado como APK** por el bloqueo D-040.

| Comprobación | Resultado | Tipo |
|---|---|---|
| `gradle -p android :core:test` (JUnit 5) | **13 de 13 superadas** | Automatizada, con datos **SIMULADOS** |
| Código Java de `app/` compilado con `javac` contra `android-all` 14 (framework de Android 14 de Robolectric, SHA-1 verificado) | Compila, con **0 avisos** de nuestro código | Comprobación estática. **No es una compilación Android ni un APK** |
| Manifiesto, recursos y configuración de AGP | **Sin verificar** | Requieren el SDK de Android |
| Pruebas en el dispositivo (S1-T01 a S1-T14) | **PENDIENTES**: ninguna ejecutada | Dispositivo real (Xiaomi 14T) |
| **Sesión 9:** `gradle -p android :app:assembleDebug` con el SDK instalado | **Compila** sin cambios de configuración (AGP 8.7.3, compileSdk 34). APK firmado con la clave de depuración (esquema v2) | Compilación real. **No es una prueba en el dispositivo** |
| **Sesión 10:** `gradle -p android :core:test` | **20 de 20 superadas** (13 anteriores + 7 de `LiveReadingTest`: límites de frescura y precisión, formato de antigüedad coherente con la frescura, estados del permiso, CSV y registros sin coordenadas) | Automatizada, **SIMULADA** |
| **Sesión 10:** APK con el panel "Lectura actual" | Compila; permisos del manifiesto final: solo ubicación precisa y aproximada, servicio en primer plano (de ubicación) y notificaciones. **Sin `INTERNET` ni `ACCESS_BACKGROUND_LOCATION`** | Compilación y revisión del manifiesto con `aapt2` |
| Panel "Lectura actual" en el Xiaomi 14T | **PENDIENTE**: no se ha instalado ni probado en ningún móvil | Dispositivo real |

**Ningún resultado de S1 procede de un dispositivo real.** Las pruebas del núcleo usan sesiones generadas en código para comprobar los cálculos (cobertura, huecos, antigüedad, batería y redacción de coordenadas), no el comportamiento de Android.

**S0 no cambia:** sus 103 pruebas siguen siendo validaciones **simuladas** del motor, no validaciones de GPS real.

## Demo visual (sesión 6)

**Qué es:** una demo **simulada** en un solo HTML (`demo/dist/rastro-demo.html`). No usa GPS, red ni servidor. Su lógica (`demo/src/sim.js`) es **independiente del motor de S0** y no lo valida ni lo sustituye.

| Comprobación | Resultado | Tipo |
|---|---|---|
| `npm run test:demo` (lógica simulada de la demo) | **21 de 21 superadas** | Automatizada, **SIMULADA** |
| Verificación por mutación de 7 reglas (D-033 en jugador y bots, disputa sin eliminación, bot que no captura al jugador en disputa, fugitivo sin ver cazadores, escáner sin coordenadas, regla por defecto) | Las 7 mutaciones las detecta al menos una prueba | Automatizada |
| `node demo/e2e/flow.e2e.cjs` en Chromium (Playwright del entorno, `file://`) a 412×915 (DPR 3) y 360×740 (DPR 2) | Recorrido completo superado en ambos tamaños en las 5 últimas ejecuciones (la última, con el código final): inicio, reglas, unirse (error y válido), configuración, sala (copiar, sortear, equipos, listos), partida como cazador (velocidad, mapa, escáner, pistas, captura) y como fugitivo (reclamación entrante, disputa, final real), final y nuevas rondas | Navegador de escritorio con **emulación** móvil |
| En el recorrido: errores de consola, desbordamiento horizontal, botones < 44 px, llamadas a la geolocalización | **0** en todas las pantallas comprobadas | Automatizada |
| Revisión visual de 36 capturas (2 tamaños) | Corregidos: avisos que tapaban el HUD y los modales, botones desactivados transparentes sobre el mapa, cambios de zona contados desde la ventaja, textos con género | Manual |
| Recorrido adicional (fuera del repositorio): botón atrás durante la partida, aceptar una disputa propia, terminar desde "Demo", política "cazan los primeros capturados", autodeclaración y atrás desde el final | Superado | Navegador con emulación móvil |
| S0 tras la sesión 6 | **103 de 103** y `typecheck` sin errores; `engine/` y `sim/` sin cambios | Automatizada |
| Núcleo de S1 tras la sesión 6 | **13 de 13** (`gradle --offline`; `android/` sin cambios) | Automatizada, SIMULADA |
| **Xiaomi 14T real** | **NO PROBADO.** Nadie ha abierto la demo en el dispositivo | — |

**Limitaciones:** el tamaño 412×915 es una aproximación del Xiaomi 14T, no una medida en el dispositivo. La emulación de Chromium no reproduce HyperOS, su gestor de archivos, la barra de gestos ni el brillo al sol. La vibración no se ha comprobado (Chromium de escritorio no vibra).

## Demo visual: pasada de diseño (sesión 7)

| Comprobación | Resultado | Tipo |
|---|---|---|
| `npm run build:demo` | Genera `demo/dist/rastro-demo.html` (113 KB) | — |
| `npm run test:demo` | **21 de 21** (la lógica simulada no cambia) | Automatizada, SIMULADA |
| `npm test` y `typecheck` de S0 | **103 de 103** y sin errores; `engine/` y `sim/` sin cambios | Automatizada |
| `node demo/e2e/flow.e2e.cjs` a 412×915 y 360×740 | Recorrido completo superado. Comprueba 0 errores de consola, 0 desbordamientos horizontales, 0 botones < 44 px, 0 llamadas a la geolocalización y, desde esta sesión, **0 peticiones de red** | Chromium con emulación móvil |
| Revisión visual selectiva (inicio, configuración, sala, partida, captura, disputa, final) | Corregidos dos solapes detectados: avisos sobre el panel abierto y sobre el pie de la sala | Manual |
| **Xiaomi 14T real** | **NO PROBADO** | — |

## H1: app Android de diagnóstico GPS (Capacitor)

**Qué es:** la app de `mobile/` (Capacitor 8.5.3, plugin nativo `OutrunLocation`, servicio en primer plano de tipo ubicación con el proveedor `fused` de la plataforma). Es un **diagnóstico GPS local**: sin permiso de Internet, sin servidor ni multijugador. El CSV que exporta no tiene coordenadas.

### Defecto de arranque y corrección

- **Síntoma:** en la primera APK (commit `dc05d46`) ningún botón respondía en el Xiaomi 14T.
- **Causa:** `nativePlugin()` devolvía el proxy de `registerPlugin(...)` desde una función `async`. El proxy responde a cualquier propiedad, también a «then», así que JavaScript lo trataba como una promesa que nunca se resolvía. El arranque se quedaba esperando antes de registrar los botones.
- **Corrección:** commit `7ac972e` (`fix(mobile): repair Capacitor diagnostic startup`), publicado en `origin/ccr-f1962362-hvwb9i`. Incluye:
  - el plugin entregado envuelto en `{ plugin }`;
  - un tiempo límite de arranque de 5 s;
  - errores de conexión y de suscripción visibles en «Incidencias», sin dejar los botones inutilizables;
  - pruebas de regresión que fallan con el código anterior.

### Pruebas automatizadas (25–26/10/2026)

| Comprobación | Resultado | Tipo |
|---|---|---|
| `npm test` en `mobile/` | **29 de 29** (24 previas + 5 de regresión) | Automatizada en Node. Las de regresión usan el runtime real de `@capacitor/core` con un puente Android **simulado** |
| `node e2e/boot.e2e.cjs` sobre `www/` | **4 de 4** escenarios | Chromium con el `native-bridge.js` real de Capacitor y el lado nativo **simulado** |
| La misma E2E sobre los archivos web extraídos de la APK corregida | **4 de 4** | Igual: comprueba el JavaScript empaquetado, **no** el código nativo |
| Pruebas Java de la app (`:app:testDebugUnitTest`) | **8 de 8** | Unitarias Java del puente y de la privacidad del CSV, sin dispositivo |
| Núcleo S1 (`:s1core:test`) | **20 de 20** | Unitarias Java con datos **simulados** |
| Motor S0 (`npm test` en la raíz) | **112 de 112** | Automatizada, **SIMULADA** |
| Demo (`npm run test:demo`) | **62 de 62** | Automatizada, **SIMULADA**; ajena a H1 |
| `git diff --check` de la corrección | Sin errores | — |

**Límite:** ninguna prueba automatizada ejecuta el código nativo en un móvil. Las E2E y las de regresión simulan el lado nativo; las pruebas Java no usan Android real. La prueba física es una evidencia aparte.

### Prueba física en el Xiaomi 14T

Datos del CSV exportado, **comunicados por el propietario**. El CSV no está en el repositorio y no se ha analizado con `AnalyzeCli`.

| ID | Fecha | Dispositivo / SO | Variante | Red | REAL / SIMULADO | Medido | Resultado | Observaciones |
|---|---|---|---|---|---|---|---|---|
| H1-F1 | Comunicada el 26/10/2026 | Xiaomi 14T (HyperOS; versión no anotada) | H1, APK corregida (`7ac972e`), intervalo solicitado de 5 s | Sin red (la app no usa Internet) | **REAL** | Sesión de unos 5 min: 58 lecturas `fix`, proveedor `fused`, precisión estimada de unos 1,1 a 9,4 m, batería del 94 % al 93 % | Los botones responden. Siguieron llegando lecturas tras `SCREEN_OFF` y `APP_HIDDEN`. Se registraron `SCREEN_ON`, `APP_VISIBLE` y `SESSION_STOP`. 0 huecos de más de 30 s | Ver la interpretación siguiente |

**Interpretación prudente:**
- Hay evidencia positiva de recepción de posiciones durante esta sesión, también con la pantalla apagada y la app en segundo plano.
- «0 huecos» significa que nunca pasaron más de 30 s sin lecturas (`GAP_THRESHOLD_MS`). No demuestra que el muestreo fuera exactamente cada 5 s.
- La bajada de batería del 1 % en unos 5 min no se puede atribuir por completo a la app ni sirve para estimar el consumo.

**Pendiente de validar:**
- una sesión larga caminando;
- portales, interiores, garajes o zonas con mala señal;
- el consumo de batería en una sesión larga;
- la estabilidad con los ajustes de ahorro de batería de HyperOS a largo plazo (no se anotaron en esta sesión);
- varios jugadores, sincronización por red y salas reales (fuera del alcance de H1);
- iPhone.

**H1 no es una versión multijugador funcional.**

## F1: motor seguro (26/10/2026, sin commit)

| Comprobación | Resultado | Tipo |
|---|---|---|
| Privacidad de roles y preferencias (`sim/test/privacy.test.ts`): asignación automática y manual, cuenta atrás, revelación, cambio de anfitrión y revancha | **4 de 4**. Se inspecciona todo lo que recibe cada cliente | Automatizada, SIMULADA |
| Validación de comandos (`engine/test/validation.test.ts`), incluidas **4.000 entradas inválidas generadas** con semilla fija | **9 de 9**: sin excepciones, sin estado alterado | Automatizada |
| D-033: cazador fuera de la zona (`engine/test/capture.test.ts`) | **5 de 5** | Automatizada, SIMULADA |
| Verificación por mutación | Reintroducir cada filtración, quitar el validador o quitar D-033 hace fallar las pruebas correspondientes | Automatizada |

**D-035 no implementada.** La autoridad de resolución, la regla predeterminada, el plazo de resolución y el estado `RESOLVING` solo existen como **propuestas** (`GAME_MODES_AND_RULES.md` §9.3). Hoy, un rechazo cierra la reclamación sin capturar al fugitivo.

**D-033, casos sin definir:**
- Una reclamación aceptada cuando el cazador ya ha salido de la zona.
- Una autodeclaración que nombra a un cazador que está fuera.

## H2: servidor y cliente multijugador (26/10/2026, sin commit)

**Qué hay:**
- `server/`: WebSocket propio sin dependencias, protocolo validado, autoridad reutilizando el motor, sesiones, reanudación, idempotencia, límites y limpieza.
- `mobile/www/`: interfaz de partida y `net.js`.
- APK de depuración `0.2.0-h2`, con permiso `INTERNET`.

| Comprobación | Resultado | Tipo |
|---|---|---|
| Partida completa con **5 clientes reales** (`net.js`) por WebSocket: sala, cuenta atrás, revelación individual, huida de 2 min, persecución, capturas (lectura antigua, imprecisa y a ráfagas rechazadas; válida aceptada), corte y reconexión con recuperación del evento perdido, final y revancha. Revisión de todo el tráfico recibido | Superada | Clientes y servidor reales en un ordenador; tiempo y ubicaciones SIMULADOS |
| Cliente con el reloj desfasado una hora | Su lectura cuenta como actual: el servidor mide la antigüedad con su propio reloj | Igual |
| Clientes hostiles: JSON inválido, mensajes de más de 4 KB, binarios, comandos de sistema, cambiarse el rol, comandos duplicados, sesiones falsas, adivinar códigos, avalanchas de mensajes, orígenes ajenos, URL mal formadas, salir de la carpeta pública, sesión abierta en dos sitios | Rechazados o cortados de forma controlada; el servidor sigue vivo | Automatizada |
| Limpieza: sala cancelada o abandonada (30 min) | Se borran la sala y las sesiones | Automatizada, reloj SIMULADO |
| E2E de la interfaz con 5 navegadores (412×915) | 8 de 8 etapas, 0 errores de página, ningún dato ajeno en las tramas recibidas | Chromium, geolocalización emulada |
| `mobile/` `npm test` | **41 de 41** | Automatizada |
| E2E de arranque del diagnóstico (ahora en `diagnostic.html`) | 4 de 4 | Chromium, lado nativo simulado |
| Java de la app y núcleo S1 (Gradle) | 8 de 8 (forzadas a ejecutarse) y 20 de 20 (sin cambios en su código) | Automatizada |
| APK `the-outrun-h2-multijugador-debug.apk` | Compila y está firmada. Sus 16 archivos web son idénticos a `www/`. Permisos: ubicación, servicio en primer plano, notificaciones e Internet | Compilación. **No instalada en ningún móvil** |

**Fallos encontrados y corregidos durante H2:**
- **Apagado colgado:** el servidor no podía apagarse con sockets WebSocket abiertos.
- **Expulsión silenciosa:** el expulsado no se enteraba y se quedaba en una sala congelada.
- **Conexiones muertas:** no se detectaban las que mueren sin cerrarse. Ahora hay un latido en el cliente.
- **Pings acumulados:** las cadenas de ping se acumulaban con cada reconexión.
- **Sesión duplicada:** abrir la misma sesión en dos sitios provocaba un bucle de reconexiones.
- **Caídas del servidor:** una URL mal formada, o una excepción al procesar un mensaje, podían tumbar el proceso.
- **Interfaz:** avisos que tapaban el botón «Empezar partida», temporizadores sin corregir si fallaban los ping, texto que se perdía al teclear, e Intro en el campo del código que creaba una sala.
- **Pruebas:** una carrera en la prueba de reconexión (la condición leía una instantánea antigua) y una espera insuficiente en la e2e.

**Pendiente de validar con móviles reales:**
- Una partida con 5 personas en la calle.
- Acceso desde redes distintas mediante un túnel HTTPS.
- Que la app Android **envíe** las lecturas con la pantalla bloqueada.
- Batería durante una partida.
- iPhone: solo navegador por ahora, y la app iOS no existe.

## H2: prueba real en Android, preparación (26/10/2026, sin commit)

**Objetivo:** que varias personas puedan jugar desde sus propios móviles. **No se ha hecho ninguna prueba física** en esta sesión: no había móviles disponibles. El procedimiento para hacerla está en `mobile/PRUEBA_PARTIDA_ANDROID.md`.

### Problemas encontrados y corregidos

| # | Problema | Causa | Corrección | Prueba de regresión |
|---|---|---|---|---|
| 1 | **Con la pantalla bloqueada, la ubicación podía dejar de llegar al servidor** aunque el GPS siguiera midiendo | Las lecturas se enviaban desde la página (WebView). Android y Chromium pueden ralentizar o detener una página oculta. H1 solo comprobó la medición, no el envío | En partida, el servicio en primer plano envía cada lectura por HTTPS (`POST /api/loc`), con el mismo límite por jugador que el WebSocket. La página deja de enviar mientras el envío nativo funciona, y vuelve a enviar si falla | `server/test/upload.test.mjs` (6): fases, límite compartido, sesiones falsas, peticiones hostiles y captura validada solo con lecturas por HTTP. `UploaderTest` (4) y `UploadContractTest` (7) en Java. Comprobación cruzada única: el emisor Java real contra el servidor Node real (204, antigüedad bien convertida) |
| 2 | **El anfitrión que centraba la zona no enviaba nunca su ubicación en la partida** (solo en la app) | El receptor de lecturas nativas se quedaba con la función del primer `start()` (la de centrar la zona) | Un único receptor que entrega al último `start()`. Las operaciones con el módulo nativo van en fila, y se espera a que una sesión pare antes de abrir otra | `mobile/test/lockscreen.test.mjs`: falla con el código anterior y pasa con el corregido (comprobado) |
| 3 | **Falsos cortes de conexión** al volver de la pantalla bloqueada | El latido daba la conexión por muerta en cuanto un temporizador retrasado veía más de 25 s de silencio | Antes de cortar, se envía una sonda (ping) y solo se corta si no responde en 5 s | `lockscreen.test.mjs` (relojes simulados): falla con el código anterior. La detección de conexiones muertas de verdad sigue probada, también en la e2e |
| 4 | **Una página dormida perdía la conexión a los 75 s**, y con ella el anfitrión su papel a los 120 s; un túnel también puede cerrar por inactividad | El servidor solo esperaba los ping del cliente, que no llegan si la página está dormida | Ping de protocolo del servidor cada 20 s. Lo contesta la pila de red del cliente sin JavaScript | `server/test/keepalive.test.mjs`: con ping, un cliente callado sigue conectado; sin él, se corta |
| 5 | **La notificación decía «No se envía ni se guardan coordenadas»** durante una partida en la que sí se envían | Texto heredado del diagnóstico de H1 | Texto según la sesión: en partida, «tu ubicación se envía al servidor de la partida». El contrato del módulo ya no dice `sendsToNetwork: false` | `UploadContractTest` |
| 6 | El servicio podía seguir midiendo tras ser capturado o al acabar la partida si la página estaba dormida o cerrada | Solo la página paraba el servicio | El servidor responde 410 (o 401 si la sesión ya no vale) y el servicio termina solo | `upload.test.mjs` y `UploadContractTest` |

**Ayudas para la prueba física:**
- `/health` cuenta las lecturas por canal, y `server/health-watch.mjs` las registra cada 10 s.
- El CSV de cada móvil anota los envíos cada 30 s (`uploaded=`, `upload_error=`).
- El radar muestra la antigüedad de la posición de cada compañero.
- La APK es `0.3.0-h2-bloqueo`.

### Revisión de seguridad (fase 2)

Sin fallos demostrables nuevos aparte de los de la tabla.

**Comprobado:**
- Acceso a salas y sesiones ajenas: secreto de 32 bytes comparado como hash en tiempo constante, y 20 fallos/min por dirección.
- Fugas de rol y ubicación: pruebas de privacidad del motor, del servidor y de la e2e.
- Validación de mensajes y límites de frecuencia.
- Expiración de salas: el motor cierra las salas inactivas y la vida máxima de una sala; el servidor borra las cerradas.
- Errores aislados por conexión.
- Coordenadas fuera de rango: las rechaza el motor.

**Del nuevo `POST /api/loc`:**
- Exige `Content-Type: application/json`, así que un navegador no puede usarlo desde otra web sin una comprobación previa que el servidor no admite.
- Comprueba el origen y limita el cuerpo a 1 KB.
- La sesión va en el cuerpo, nunca en la URL.
- No sigue redirecciones desde el móvil.

**Limitaciones que siguen abiertas:**
- Ubicación falsificada: solo se marca.
- Expulsión basada en el identificador de instalación.
- Salas en memoria.
- Detrás del túnel sin `TRUST_PROXY=1`, todos los móviles comparten la dirección del túnel en los límites por dirección.

### Pruebas ejecutadas (26/10/2026)

| Suite | Resultado | Tipo |
|---|---|---|
| Motor y simulación (`npm test`) | 130 de 130 | Automatizada, simulada |
| `npm run typecheck` | Sin errores | Estática |
| Servidor (`npm run test:server`) | 19 de 19 | Automatizada; clientes reales en un ordenador |
| Cliente (`mobile/` `npm test`) | 49 de 49 | Automatizada; módulo nativo y WebSocket simulados |
| E2E de la partida (5 navegadores) | 8 de 8 etapas, 0 errores de página, sin datos ajenos | **Navegador** (Chromium, geolocalización emulada) |
| E2E de arranque del diagnóstico | 4 de 4 | **Navegador**, lado nativo simulado |
| Java de la app y núcleo S1 (Gradle) | 19 de 19 y 20 de 20 | Automatizada, sin dispositivo |
| APK `the-outrun-h2-pantalla-bloqueada-debug.apk` | Compila, con la misma firma de depuración que las anteriores. Su web es idéntica a `www/`. Mismos permisos que la APK H2, sin ubicación en segundo plano | Compilación. **No instalada en ningún móvil** |

### Escenarios y cómo se han validado

| Escenario | Automatizado | Navegador | Físico |
|---|---|---|---|
| Crear sala, unirse, sincronizar fases y tiempos | Sí | Sí | **No** |
| Ubicación con la pantalla bloqueada (envío nativo) | Sí: servidor, cuerpo Java, emisor Java contra un servidor local y contra el servidor Node | No aplica (es nativo) | **No** |
| Conexión viva con la página dormida (ping del servidor) | Sí, con el WebSocket de Node | No | **No** |
| Corte de red y recuperación | Sí | Sí (modo sin conexión de Playwright) | **No** |
| Captura con GPS real | No (lecturas simuladas) | No (geolocalización emulada) | **No** |
| Acceso por túnel HTTPS desde datos móviles | No | No | **No** |
| HyperOS con la pantalla bloqueada durante una partida | No | No | **No** |
| Camino completo de la app con envío nativo (`app.js`) | En parte: adaptador y puente simulados | **No** (necesita HTTPS) | **No** |

**Sin validar:** todo lo de la columna «Físico», la batería en partida, iOS (no existe la app), y D-035 (pendiente de decisión, sin implementar).

## Recuperación en Windows y enlace/QR (26/10/2026, tarde, sin commit)

**Entorno:** Windows 11, Node 24.12.0, npm 11.6.2, Chrome del sistema. Copia `C:\Users\aange\Projects\Juego-escondite-recuperacion`, rama `recuperacion-h2` sobre `4c190a0`. Sin JDK ni Android SDK: no se ha compilado ni probado nada de Android.

### Recuperación
- El parche de F1/H2/H2.1 (`the-outrun-h2-h2.1-sobre-4c190a0.patch`, SHA-256 `ef5e9a2f…22989163`) se aplicó sobre `4c190a0` y dio el árbol esperado `e0e2bcb1be6cbca6c468813165de02773ae4d39a`.
- **Corrección de portabilidad (autorizada):** `server/test/hostile.test.mjs` usaba `new URL(...).pathname` como ruta de archivo, que en Windows da `/C:/…`; ahora usa `fileURLToPath`. El servidor no cambió: ya usaba `fileURLToPath`.
- **Commits (después, con la identidad local que facilitó el propietario):**
  - `664cf53`, con el árbol `e0e2bcb1…`: el esperado del parche;
  - `5611274`, con el árbol `53bc009b…`: igual al del primer respaldo, y solo `hostile.test.mjs` (+2/−1) respecto a `664cf53`.

  Se crearon con `commit-tree` y `update-ref` (comprobando el valor anterior), sin tocar el árbol de trabajo. Locales, sin push.
- **Respaldo:** `C:\Users\aange\Downloads\outrun-respaldo-20261026-182641\`. Contiene el parche de la recuperación con la corrección de Windows (reproduce el árbol `53bc009b…` sobre `4c190a0`, comprobado), el parche original y `SHA256SUMS.txt`.

### Pruebas al empezar el bloque (antes de cambiar código)
| Suite | Resultado |
|---|---|
| `npm test` | 130 de 130 |
| `npm run typecheck` | Sin errores |
| `npm run test:server` | 19 de 19 |
| `mobile/` `npm test` | 49 de 49 |
| `npm run test:demo` | 62 de 62 |

### Enlace de invitación, QR y cambio de código (D-048)
| Comprobación | Resultado | Tipo |
|---|---|---|
| `mobile/test/qr.test.mjs`: Reed-Solomon del ejemplo «HELLO WORLD» 1-M; bits de formato del nivel M (8 máscaras); bits de versión 7; capacidades; ida y vuelta de versión 1 a 10 con comprobación Reed-Solomon de cada bloque; patrones fijos; SVG | **7 de 7** | Automatizada. Los vectores son de la norma. La ida y vuelta usa piezas del propio codificador (orden de colocación y máscaras) |
| `mobile/test/invite.test.mjs`: alfabeto igual al del servidor, normalización, enlace sin credenciales, ida y vuelta del enlace | **5 de 5** | Automatizada |
| `server/test/invite.test.mjs`: el anfitrión cambia el código, todos lo reciben una vez, el anterior da `not_found` y el nuevo sirve; un invitado → `forbidden`; campos extra → `invalid_command`; tras empezar → `wrong_phase` | **2 de 2** | Servidor y clientes reales por WebSocket en un ordenador |
| `node mobile/e2e/web-flow.e2e.mjs <chrome.exe>` (primera parte): Chrome real sin interfaz y servidor real en 127.0.0.1, con tres jugadores en contextos aislados. El anfitrión crea la sala; **el QR de la interfaz se decodifica con el enlace exacto**; el enlace precarga el código y se borra de la barra; el invitado entra; doble toque para cambiar el código; los dos ven el nuevo; el enlace antiguo da «No existe ninguna sala»; con el nuevo entra un tercero | 11 comprobaciones | **Navegador real** (Chrome de escritorio). No es un móvil |

**Pendiente de validar:**
- escanear el QR con la cámara de un móvil (AC-A6);
- abrir el enlace en un móvil;
- abrir la app Android desde el enlace (App Links): no implementado, necesita dominio propio.

### Mission Report mínimo (Plan Maestro §4.4)
| Comprobación | Resultado | Tipo |
|---|---|---|
| `mobile/test/report.test.mjs`: sin final no hay informe; todos capturados (duración, tiempo hasta la victoria, orden cronológico, ranking, momentos); fin por tiempo (sin «hasta la victoria»; un empate no es «más capturas»); fin del anfitrión durante la huida (sin duración); sin coordenadas ni equipos | **5 de 5** | Automatizada |
| `server/test/report.test.mjs`: partida real de 3 jugadores hasta «todos capturados»; el informe es igual para todos y coincide con el estado del servidor (`finishedAt − activeStart`, capturas, tiempo hasta la victoria); un jugador reconecta con su sesión y el informe es idéntico | **1 de 1** | Servidor y clientes reales por WebSocket; tiempo SIMULADO |
| `web-flow.e2e.mjs` (segunda parte): asignación manual de roles, centrar la zona con geolocalización **emulada**, lista de seguridad, todos listos, cuenta atrás, **revelación privada** («FUGITIVO» solo para Beto), huida, persecución, «Me han pillado», **Mission Report igual en los tres navegadores**, recarga de la página y **el mismo informe**, 0 errores de JavaScript | **5 comprobaciones** (16 en total entonces; 17 tras la revisión) | **Navegador real**; reloj del servidor controlado y posiciones emuladas |

**Cambio en la vista del motor:** la instantánea incluye ahora `activeStart` y `finishedAt`. Son horas del servidor iguales para todos, sin datos privados. Las pruebas de privacidad del motor y del servidor siguen superadas.
**Fuera de este bloque (§4.4):** mapa o recorridos, compartir el informe y revelar los equipos al final (decisión pendiente).

### Revisión y refuerzo de la invitación (26/10/2026, 19:17-19:30)
**Revisión del codificador QR:** se leyó entero, sin defectos encontrados. Se revisaron la colocación de los patrones fijos (también la alineación sobre la temporización en v7+), las dos copias del formato, la información de versión, las 8 máscaras en la notación de la norma, el terminador y el relleno, el intercalado de bloques y la penalización N1–N4.

**Independencia de las referencias (cambio en `mobile/test/qr.test.mjs`, ahora 10 pruebas):**
- **Vectores publicados**, escritos como constantes:
  - Reed-Solomon de «HELLO WORLD» 1-M y del anexo I de la norma («01234567» 1-M);
  - las 8 cadenas de formato del nivel M;
  - la información de versión de 7 a 10;
  - las capacidades en bytes de v1 a v10.
- Codewords de datos de «Hi» **calculados a mano** a partir de la norma.
- **Lector propio, sin importar nada del codificador:**
  - mapa de módulos reservados, máscaras con i = fila y j = columna, y su propio zigzag;
  - comprueba que las dos copias del formato están en la tabla publicada y coinciden;
  - comprueba los síndromes de Reed-Solomon con tablas exponenciales (otro método que el del codificador).
- Una prueba comprueba que el lector rechaza un QR dañado.
- **Mutación:** con las filas y columnas de la máscara 4 intercambiadas, la ida y vuelta **falla** (el lector anterior, que compartía las máscaras del codificador, no lo detectaba). Revertida.
- **Límite:** el lector sigue escrito en este proyecto. No hay ningún lector de terceros disponible sin instalar herramientas, y en Windows Chrome y Edge no exponen `BarcodeDetector` (comprobado). **El QR no está validado con una cámara ni en un móvil.**

**Renovación del código (`server/test/invite.test.mjs`, 9 pruebas, servidor y clientes reales en un ordenador):**
- código nuevo para todos, con un solo aviso;
- el anterior da `not_found` y deja de apuntar a la sala;
- tras dos renovaciones no sirve ninguno de los anteriores;
- quien ya está dentro reanuda con su sesión y recibe el código vigente;
- un jugador que no es el anfitrión → `forbidden`, sin cambio y con el código aún válido;
- campos extra → `invalid_command`, y no se puede elegir el código;
- el mismo comando repetido con el mismo id no renueva dos veces;
- **colisiones** (generador forzado `HubOptions.generateCode`): nunca coincide con el código de otra sala activa ni con el actual;
- `wrong_phase` en COUNTDOWN, HEAD_START, ACTIVE y FINISHED, y vuelve a estar permitido en la sala de espera de la revancha;
- al cancelar la sala, el código vigente también deja de servir.

**Mutaciones** (revertidas, comprobado que no queda rastro): no borrar el código anterior → 3 pruebas fallan; quitar la comprobación de anfitrión → 1 falla.

**Enlaces (`mobile/test/invite.test.mjs`, 8 pruebas):** códigos no válidos de todo tipo (longitud, caracteres ambiguos, tildes, espacios de ancho cero, tipos no texto); parámetro repetido, en el fragmento, codificado o con otra clave; URL de servidor con puerto, ruta, consulta, fragmento o credenciales; esquemas no permitidos. **Cambio de comportamiento:** `codeFromLink` acepta solo enlaces http(s) (antes también `javascript:…?sala=`, que no era explotable porque solo extrae un código de 6 caracteres de la propia dirección).

**Flujo completo en un navegador real:** `web-flow.e2e.mjs` comprueba ahora también que un código mal escrito muestra el aviso sin entrar. **17 de 17.** Su lector de QR reutiliza piezas del codificador; la verificación independiente es la de `qr.test.mjs`.

### Saltos del GPS en las capturas (D-049, 26/10/2026, 19:45-19:50)
| Comprobación | Resultado | Tipo |
|---|---|---|
| `engine/test/gps-jump.test.ts`: un fugitivo «aparece» junto al cazador en un salto aislado → `target_location_unstable` y no se crea la reclamación; la siguiente lectura coherente lo confirma y la captura vuelve a ser posible; un atípico aislado se descarta al volver a la posición real; el salto del cazador → `your_location_unstable`; el ruido dentro de la precisión no es un salto; correr a 8 m/s no es un salto; dos lecturas casi simultáneas muy separadas sí lo son; el campo no aparece en ningún evento | **8 de 8** | Automatizada, lecturas **SIMULADAS** |
| Mutación: quitar la comprobación del fugitivo | 2 pruebas fallan (revertida) | Automatizada |
| Regresión: motor y simulación (incluidos los bots de 15 partidas completas), servidor, cliente y E2E | 138/138, 29/29, 72/72, 17/17 | Automatizada y navegador real |

**No validado:** con GPS real. El umbral (12 m/s más la precisión) es experimental (D-038).

### Abandonar en mitad de la partida (Plan Maestro §4.5 y §10, 26/10/2026, 19:50-19:55)
**Defecto encontrado:** el motor y el servidor ya admitían `leave` durante la partida, pero la interfaz solo ofrecía «Salir» en la sala de espera y en el final. Un jugador **no podía abandonar** durante la cuenta atrás ni la partida sin cerrar la app. El Plan exige poder abandonar y dejar de compartir la ubicación (§4.5), y lo trata como criterio de privacidad (§10).
**Corrección:** botón «Abandonar la partida» en la cuenta atrás y en la partida (también para los capturados). Pide doble toque y avisa de que se deja de compartir la ubicación. Usa el mismo camino que «Salir de la sala»: `leave` y detener la ubicación local.

| Comprobación | Resultado | Tipo |
|---|---|---|
| `server/test/leave.test.mjs`: al salir se borra su posición y `POST /api/loc` responde **410** (el servicio nativo se detiene); por WebSocket tampoco cuenta; los demás dejan de verlo y la partida sigue; quien sale no recibe nada más (ni posiciones, ni pistas, ni eventos); si sale el último fugitivo, la partida termina por abandono; si sale el anfitrión, hay un nuevo anfitrión y la partida sigue | **4 de 4** | Servidor y clientes reales en un ordenador; tiempo SIMULADO |
| `web-flow.e2e.mjs`: revancha; botón visible en la cuenta atrás; en la persecución, el primer toque pide confirmación y el segundo devuelve al inicio; en el servidor queda `left` y sin lecturas; la partida sigue para los demás | **21 de 21** en total | Chrome real; geolocalización emulada |

**No validado:** que el servicio nativo de Android se detenga de verdad al recibir el 410 en un móvil. Está probado el contrato (`UploadContractTest`), no el dispositivo.

### Comprobación de GPS al pulsar «Estoy listo» (Plan Maestro §2.1 paso 4 y §4.1, 26/10/2026, 19:53-19:55)
**Defecto encontrado:**
- El permiso de ubicación se pedía al **empezar la cuenta atrás**, en mitad de la partida.
- Un jugador que lo negaba entraba igualmente sin GPS: nadie podía capturarlo (`target_location_stale`) y él no podía capturar.

**Corrección (solo en el cliente, reversible):**
- Antes de marcarse como listo, el móvil tiene que dar una posición con una precisión de 100 m o mejor (`locateOnce`, con un tiempo límite de 30 s).
- Un texto en la sala explica que se comprobará el GPS y para qué se usa la ubicación. Si falla, se explica el motivo (`gpsCheckError`) y el jugador no queda listo.
- No crea la fase CHECKS (su mapeo sigue pendiente de decisión), ni avisa a los demás de «GPS pendiente»: eso necesitaría un estado en el servidor.

| Comprobación | Resultado | Tipo |
|---|---|---|
| `mobile/test/gps-check.test.mjs`: textos para permiso denegado, sin posición y otros fallos | **3 de 3** | Automatizada |
| `web-flow.e2e.mjs`: un cuarto jugador con la ubicación **denegada** ve la explicación, pulsa «Estoy listo», ve el motivo y **no** queda listo en el servidor; los jugadores con permiso siguen el flujo normal | **23 de 23** en total | Chrome real, permisos y geolocalización emulados |

**No validado:** el diálogo de permisos real de Android y de iOS en un móvil.

### Persistencia opcional del servidor (D-050, 26/10/2026, 19:55-20:00)
| Comprobación | Resultado | Tipo |
|---|---|---|
| `server/test/persistence.test.mjs`: (1) partida en ACTIVE con una captura: tras reiniciar en el mismo puerto, los 3 clientes reales se reconectan solos y se conservan la fase, el final oficial y las capturas; el archivo no tiene lecturas, pistas ni secretos; después se reclama, se confirma y la partida termina; (2) en la sala de espera, el anfitrión sigue siéndolo, el código restaurado sirve y una sesión falsa da `bad_session`; (3) **caída** con un archivo anterior a lo que vieron los móviles: aceptan el estado restaurado y la numeración sigue hacia delante; (4) un archivo ilegible no impide arrancar y no se sobrescribe sin cambios; (5) sin `STATE_FILE` no se escribe nada | **5 de 5** | Servidor real reiniciado y clientes reales en un ordenador; tiempo SIMULADO |
| Mutación: margen de numeración a 0 | Falla la prueba (3), la de la caída (revertida) | Automatizada |
| Regresión | 138, servidor 38, cliente 75 y E2E 23 | — |

**No validado:**
- un reinicio real en mitad de una partida con móviles;
- el comportamiento del túnel ante el reinicio;
- un apagado brusco del proceso: la prueba simula la caída con un archivo anterior, no matando el proceso.

### Sala de espera e incidencias de conexión (Plan Maestro §7, 26/10/2026, 20:00-20:03)
**Defectos encontrados:**
- Solo el anfitrión veía qué impedía empezar. Además, los desconectados se mezclaban con los que no estaban listos («Esperando a: …»).
- Al perder la conexión, solo cambiaba una etiqueta pequeña en la cabecera, sin explicar qué pasaba con la partida.

El Plan considera errores, en la sala, «no indicar quién está desconectado o qué impide empezar» y, en las incidencias, «dejar al jugador sin contexto».

**Corrección:**
- `startBlockers(snap, { forHost })`: lo ven todos. Al anfitrión le dice qué hacer y a los demás, qué falta. Separa «Sin conexión: …» de «Falta que estén listos: …».
- `connectionNotice(status, phase)`: aviso visible (`role="alert"`) mientras se reconecta. En partida explica que la partida sigue y que el servidor manda en el tiempo y en las capturas.

| Comprobación | Resultado | Tipo |
|---|---|---|
| `mobile/test/lobby-status.test.mjs`: textos para el anfitrión y para los demás, desconectados separados, sin bloqueos, invitados que no cuentan, aviso de conexión por estado y fase | **4 de 4** | Automatizada |
| `web-flow.e2e.mjs`: el jugador que no es anfitrión ve «Para empezar falta» con el nombre del que no está listo; Dani **cierra la pestaña** (corte real del WebSocket) y todos ven «Sin conexión: Dani»; el anfitrión la expulsa con el botón real | **26 de 26** en total | Chrome real |

**No probado en navegador:** el aviso de reconexión en mitad de una partida. Reproducirlo exige esperar a que el cliente detecte una conexión muerta (unos 30 s); está cubierto por pruebas unitarias. Tampoco se ha probado en un móvil.

### Capacidad de salas por dirección (26/10/2026, 20:03-20:05)
**Riesgo encontrado (demostrable):**
- Crear una sala no contaba como fallo, y los límites eran por conexión.
- Una sola dirección que abriera conexiones nuevas podía crear las 100 salas y dejar a todos los demás con `server_full`. La segunda prueba lo reproduce sin el límite.

**Corrección:** como mucho 5 salas activas creadas desde la misma dirección (`HubOptions.maxRoomsPerIp`, `MAX_ROOMS_PER_IP`). Las salas cerradas no cuentan. La dirección solo se guarda en memoria, nunca en el archivo de estado. Error `too_many_rooms`, con un texto para el jugador.

| Comprobación | Resultado | Tipo |
|---|---|---|
| `server/test/capacity.test.mjs`: 5 salas sí y la 6.ª no desde la misma dirección; otra dirección no se ve afectada; sin el límite, una dirección llena el servidor; al cerrar una sala se puede volver a crear; el límite es configurable | **4 de 4** | Hub con transportes de prueba (direcciones simuladas) |

**Límite:** detrás de un túnel sin `TRUST_PROXY=1`, todos los móviles comparten dirección y el límite pasa a ser global (documentado en `server/README.md`).

### Reglas de la partida para todos (briefing común; Plan Maestro §2.1 paso 5, §3.3 y §7; 26/10/2026, 20:05-20:08)
**Hueco encontrado:** antes de empezar, los jugadores solo veían las duraciones. En ningún sitio se explicaban el criterio de captura (§3.3: «el briefing explica el criterio de captura»), qué pasa al salir de la zona, las pistas ni lo que ven los capturados. El Plan lo considera un error: «esconder una regla que cambie la estrategia».
**Corrección:** tarjeta «Reglas de la partida» en la sala de espera, visible para todos. La genera `briefing(config)` con la configuración de la sala y los valores del motor (`RULES`): objetivo, roles, tiempo, zona, pistas, captura, capturados y seguridad.

| Comprobación | Resultado | Tipo |
|---|---|---|
| `mobile/test/briefing.test.mjs`: los números coinciden con `engine/src/constants.ts` (cuenta atrás, antigüedad y precisión de la captura, plazo de confirmación, gracia fuera de la zona, retraso del espectador); usa la configuración de la sala; cubre las 8 secciones; sin coordenadas | **3 de 3** | Automatizada |
| `web-flow.e2e.mjs`: el invitado ve la tarjeta con captura, zona, pistas, seguridad y capturados | **27 de 27** en total | Chrome real |

**Fuera de alcance:** la fase BRIEFING del Plan, con las reglas fijadas en una fase propia (pendiente de decisión). Tampoco cambia la tarjeta privada de rol.

### Experiencia en un móvil pequeño (Plan Maestro §7.1 y F8, 26/10/2026, 20:08-20:10)
`web-flow.e2e.mjs` emula ahora una pantalla de **360×740** (escala 2, táctil) en los cuatro jugadores. En **11 pantallas** del flujo comprueba que no hay desbordamiento horizontal, ni controles táctiles de menos de 44 px de alto, ni texto visible de menos de 12 px:
- inicio, inicio con invitación y QR;
- sala de espera del anfitrión (sin configurar y configurada) y del invitado (con reglas);
- cuenta atrás, partida como fugitivo y como cazador, y «declararse capturado»;
- Mission Report.

**Defectos encontrados y corregidos** (`mobile/www/css/game.css`):
- el selector de rol junto a cada jugador (`.mini`) medía 40 px de alto: ahora mide 44 px;
- la etiqueta «Anfitrión» (`.tag`) usaba 11 px: ahora usa 12 px.

| Comprobación | Resultado | Tipo |
|---|---|---|
| `web-flow.e2e.mjs` con las comprobaciones de diseño | **28 de 28** (antes de corregir: 27 de 28, con 4 pantallas afectadas) | Chrome con **emulación** móvil. No es un móvil real |

**No comprobado:** el contraste a pleno sol, la barra de gestos, el tamaño real de fuente del sistema ni lectores de pantalla.

### Indicador de ubicación compartida (Plan Maestro §4.5, 26/10/2026, 20:10-20:12)
**Hueco:** el Plan exige mostrar **cuándo** se comparte la ubicación.
- La partida solo mostraba la precisión del GPS, y «ubicación inactiva» cuando no se seguía.
- La cuenta atrás, en la que ya empieza el seguimiento, no mostraba nada.

**Corrección:** `sharingStatus(tracking, uploading)` y un indicador con texto y símbolo (● / ○, no solo color) en la cuenta atrás y en la partida: «Compartiendo tu ubicación con el servidor de la partida», añadiendo «también con la pantalla bloqueada» cuando lo envía el servicio nativo, o «No se comparte tu ubicación» (por ejemplo, para un capturado).

| Comprobación | Resultado | Tipo |
|---|---|---|
| `mobile/test/lobby-status.test.mjs` (nueva prueba) | **5 de 5** en el archivo | Automatizada |
| `web-flow.e2e.mjs`: desde la cuenta atrás se ve «Compartiendo tu ubicación» | **29 de 29** en total | Chrome real, geolocalización emulada |

### Versión de reglas por partida (Plan Maestro §8.3, 26/10/2026, 20:11-20:13)
`RULES_VERSION` (`engine/src/constants.ts`, ahora `clasico/2026-10-26`) se fija en `RoomState.rulesVersion` al empezar cada partida. Viaja en `game_finished` y en la instantánea, y el Mission Report la muestra («Reglas: …»). Hay que cambiarla cada vez que cambie una regla que afecte al resultado; D-049 ya cambió el criterio de captura.

| Comprobación | Resultado | Tipo |
|---|---|---|
| `engine/test/rules-version.test.ts`: sin versión antes de jugar; se fija al empezar y llega a `game_finished`, a la instantánea y al final | **2 de 2** | Automatizada |
| `mobile/test/report.test.mjs` (+1) y `server/test/report.test.mjs`: el informe lleva la versión del motor; las partidas guardadas antes de existir el campo dan `null` | Superadas | Automatizada; servidor real |
| Regresión | motor 140, servidor 42, cliente 84 y E2E 29 | — |

### Pruebas al cerrar (26/10/2026, 19:22-19:30 según el reloj del sistema)
| Suite | Resultado |
|---|---|
| `npm test` | 130 de 130 |
| `npm run typecheck` | Sin errores |
| `npm run test:server` | **29 de 29** (19 + 9 de renovación del código + 1 de Mission Report) |
| `mobile/` `npm test` | **72 de 72** (49 + 10 de QR + 8 de enlace + 5 de Mission Report) |
| `npm run test:demo` | 62 de 62 |
| `node mobile/e2e/web-flow.e2e.mjs <chrome.exe>` | **17 de 17**. Al terminar no quedan procesos de Chrome ni de Node |

**No ejecutadas:**
- `mobile/e2e/game.e2e.mjs` y `boot.e2e.cjs`: necesitan Playwright, que no está instalado. Se comprobó que sus selectores (`.code`, `#f-code` en minúsculas, `[data-act=…]`) siguen existiendo.
- Pruebas Java y Gradle: no hay JDK ni SDK.

