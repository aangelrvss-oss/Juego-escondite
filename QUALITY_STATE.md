# Estado de calidad

**Última actualización:** 26/10/2026 (cierre documental de H1)

## Resumen

| Tipo de prueba | Estado |
|---|---|
| Pruebas automatizadas del motor y de la simulación | **103 de 103** el 24/10/2026 (2 ejecuciones idénticas); **112 de 112** tras D-042 (25/10/2026). Todas son **SIMULADAS** |
| Verificación por mutación (3 invariantes de seguridad) | Las 3 mutaciones las detecta al menos una prueba |
| Pruebas en dispositivos reales | **Una sesión corta de H1 en un Xiaomi 14T** (ver «H1» al final). El resto de pruebas físicas (S1–S3 y la lista de H1) siguen **pendientes** |
| Transporte de red real (WebSocket), latencia y cobertura móvil | **No probado**: el adaptador depende de D-014, que sigue pendiente |
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
