# Resultados de las pruebas · 27/10/2026, 23:15–23:35

Ejecutadas de nuevo para esta auditoría, en serie, sobre la rama `mapa-real` (commit `462016d` más 33 cambios sin confirmar). Salida completa de cada una en `registros/`.

## Qué significa cada tipo

- **Automatizada:** Node, sin navegador. El motor y el servidor son reales, pero el reloj y las ubicaciones son simulados.
- **Simulación de navegador:** Chrome o Chromium reales con una pantalla de móvil emulada (360×740 u otras) contra el servidor real en memoria, en 127.0.0.1. **El GPS, el reloj del servidor y la cartografía son simulados. No son móviles.**
- Ninguna prueba usa cartografía real, un teléfono físico, datos móviles ni el túnel público.

## Resultados

| # | Prueba | Comando | Tipo | Resultado | Registro |
|---|---|---|---|---|---|
| 1 | TypeScript | `npm run typecheck` | Automatizada | **Sin errores** | `01-typecheck.txt` |
| 2 | Motor de reglas y simulaciones | `npm test` | Automatizada | **144/144** | `02-motor-y-sim.txt` |
| 3 | Servidor (15 archivos, 68 pruebas) | `node --test --test-concurrency=1 "server/test/*.test.mjs"` | Automatizada, servidor real + clientes reales por WebSocket | **68/68** | `03-servidor.txt` |
| 4 | Cliente (incluye la privacidad) | `cd mobile && npm test` | Automatizada | **109/109** | `04-cliente.txt` |
| 5 | Demo antigua «Rastro» | `npm run test:demo` | Automatizada | **62/62** | `05-demo.txt` |
| 6 | Flujo web: enlace, QR, partida corta, recarga, permisos y diseño a 360×740 | `node mobile/e2e/web-flow.e2e.mjs "<chrome.exe>"` | Navegador (Chrome por CDP), 3 jugadores | **41/41** | `06-e2e-web-flow.txt` |
| 7 | Partida completa con 5 navegadores | `cd mobile && node e2e/game.e2e.mjs <capturas>` | Navegador (Playwright) | **8/8 etapas, 0 errores de página** | `07-e2e-partida.txt` |
| 8 | Mapa real: ciclo de vida, visibilidad, gestos, conexión, radar de reserva, atribución y captura | `cd mobile && node e2e/map.e2e.mjs <capturas>` | Navegador (Chrome por CDP), **cartografía simulada** | **26/26** | `08-e2e-mapa.txt` |
| 9 | Sin desbordamiento horizontal a 360 px | `cd mobile && node e2e/layout.e2e.mjs` | Navegador (Playwright, emulación móvil) | **6/6** | `09-e2e-maquetacion-360.txt` |
| 10 | Pantalla de diagnóstico GPS de la app (arranque) | `cd mobile && node e2e/boot.e2e.cjs` | Navegador; **el lado nativo está simulado** | **4/4 escenarios** | `10-e2e-arranque-diagnostico-gps.txt` |
| 11 | Recorrido de la demo | `node demo/e2e/flow.e2e.cjs` | Navegador (Playwright) | **Falla tal cual** («Cannot find module 'playwright'»). **Pasa** con `NODE_PATH=mobile/node_modules`: Playwright solo está instalado en `mobile/` | `11-e2e-demo-sin-node-path.txt`, `11-e2e-demo.txt` |
| 12 | Grabación de la partida simulada | `cd mobile && node e2e/gameplay-capture.mjs <salida>` | Navegador (Playwright) | **1.er intento fallido** (fallo del script, ver abajo); **2.º correcto** | `12a-…fallido.txt`, `12-grabacion-partida.txt` |
| 13 | Vídeos legibles y reproducibles | ffmpeg (decodificación completa) + Chromium (reproducción) | — | **Correcto:** 184,2 s y 44,0 s, 720×1480, sin errores | `13-verificacion-videos.txt` |

### Privacidad y validación de datos (dentro de las suites anteriores)

- **`mobile/test/brand-and-privacy.test.mjs`:** la interfaz solo habla con el servidor propio. La única excepción, cerrada, es el mapa: solo `https://api.maptiler.com` y su configuración local.
- **`server/test/hostile.test.mjs` (9):**
  - mensajes mal formados, demasiado grandes o binarios;
  - comandos reservados al servidor e intentos de cambiar el rol;
  - repetición del mismo comando;
  - sesiones falsas, códigos adivinados y avalanchas de mensajes;
  - orígenes web ajenos y rutas que intentan salir de la carpeta pública.
- **`server/test/logs.test.mjs` y `diagnostics.test.mjs`:** los registros no llevan coordenadas, nombres, códigos ni secretos.
- **`server/test/capture-race.test.mjs` (5):** reclamaciones simultáneas, confirmación tardía o repetida y lectura retrasada.
- **`map.e2e`:** ninguna petición a Internet fuera de la cartografía simulada.

## Fallos encontrados en esta auditoría

| Fallo | Dónde | Causa | Qué se hizo |
|---|---|---|---|
| La E2E de la demo no encuentra Playwright | `demo/e2e/flow.e2e.cjs` | Playwright solo está instalado como dependencia de desarrollo de `mobile/`, no en la raíz | Ejecutada con `NODE_PATH`. **Sin instalar nada más** ni tocar la demo |
| La grabación se cortó a los 77 s | `gameplay-capture.mjs` | **Mi script:** la interfaz se reconstruye 4 veces por segundo y el elemento que el script iba a desplazar quedó desconectado | Desplazamiento en una sola operación dentro de la página; el intento fallido se conserva (`…-videos\intento-1-fallido\`) |

## Fallos conocidos de sesiones anteriores (no aparecieron hoy)

- **GPS del navegador sin renovarse tras un corte y una reconexión simulados:** 2 de 18 ejecuciones de `map.e2e` en la sesión anterior. Hoy ha pasado 1 de 1. **Sin causa confirmada**; ver `riesgos-tecnicos.md`, R-03.

## Cambios hechos para esta auditoría

Ninguno en la aplicación. Solo en herramientas de prueba:
1. `mobile/e2e/map.e2e.mjs`: **una captura más** (`5-reclamacion-recibida-por-el-fugitivo`), para tener la pantalla de reclamación vista por el fugitivo.
2. `mobile/e2e/gameplay-capture.mjs`: desplazamientos atómicos (función `scrollTo`), para corregir el fallo de la tabla anterior.

## Lo que ninguna prueba cubre

- **Cartografía real de MapTiler:** no hay clave.
- **Teléfonos físicos:** GPS real, pantalla bloqueada, cobertura, batería, sol, gestos con el dedo y la APK Android.
- **Latencia real** por el túnel con datos móviles. El túnel solo se probó de extremo a extremo desde el ordenador, el 27/10 por la tarde.
- **iPhone / Safari:** nunca probado.
