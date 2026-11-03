# Resultados de las pruebas · 28/10/2026 (estado final: ejecución de las 00:21–00:40, tras las correcciones de la revisión independiente)

Salidas completas en `QA/registros/`.

**Tipos de prueba:**
- **Automatizada:** Node, motor y servidor reales, reloj y ubicaciones simulados.
- **Simulada en navegador:** Chrome o Chromium emulando un móvil contra el servidor real en memoria (127.0.0.1); GPS, tiempo y cartografía simulados.
- **Física:** teléfonos reales. **No se ha hecho ninguna.**

## Estado final

| Prueba | Comando (desde la raíz salvo que se indique) | Tipo | Antes (27/10) | **Ahora** | Registro |
|---|---|---|---|---|---|
| TypeScript | `npm run typecheck` | Estática | OK | **OK** | `01-typecheck.txt` |
| Lint | — | — | No existe en el proyecto | No existe | — |
| Motor | `npm test` | Automatizada | 144/144 | **145/145** (+1: fugitivo sin posición) | `02-motor.txt` |
| Servidor | `node --test --test-concurrency=1 "server/test/*.test.mjs"` | Automatizada (servidor real + clientes WebSocket) | 68/68 | **75/75** (+7 `capture-flow`) | `03-servidor.txt` |
| Cliente (incluye la privacidad) | `cd mobile && npm test` | Automatizada | 109/109 | **111/111** (+2: refresco del GPS bloqueado y peticiones colgadas con límite) | `04-cliente.txt` |
| Demo antigua | `npm run test:demo` | Automatizada | 62/62 | **62/62** | `05-demo.txt` |
| Flujo web | `node mobile/e2e/web-flow.e2e.mjs "C:\Program Files\Google\Chrome\Application\chrome.exe"` | Simulada (3 jugadores) | 41/41 | **41/41** | `06-web-flow.txt` |
| Partida con 5 navegadores | `cd mobile && node e2e/game.e2e.mjs <capturas>` | Simulada (Playwright) | 8/8 | **8/8, 0 errores de página** | `07-partida.txt` |
| Mapa | `cd mobile && node e2e/map.e2e.mjs [capturas]` | Simulada, **cartografía de prueba** | 26/26 | **29/29 en 4 de 4 ejecuciones** del estado final (y 5 de 5 antes de la revisión) (+3: avisos, acción fija y botones sin tapar) | `08-mapa-1…4.txt` |
| Maquetación a 360 px | `cd mobile && node e2e/layout.e2e.mjs` | Simulada (emulación móvil) | 6/6 | **6/6** | `09-layout.txt` |
| Arranque del diagnóstico GPS | `cd mobile && node e2e/boot.e2e.cjs` | Simulada (lado nativo simulado) | 4/4 | **4/4** | `10-boot.txt` |
| Grabación de la partida | `cd mobile && node e2e/gameplay-capture.mjs <salida>` | Simulada, **calles sintéticas** | — | **OK**: auditoría 184,0 s, resumen 44,2 s, ambos reproducibles; ✔ acción y botones visibles para la cazadora | `11-grabacion-partida.txt`, `12-verificacion-videos.txt` |
| Dependencias | `npm audit` (raíz) / `cd mobile && npm audit` | — | — | Raíz: 0. `mobile/`: 3 moderadas (`uuid` en la herramienta de Capacitor, solo de desarrollo; igual que antes) | — |
| Compilación de producción | — | — | — | **No aplica:** la interfaz se sirve sin compilar. `npm run build:demo` solo genera la demo antigua (no se ejecutó porque reescribe un archivo versionado). La APK necesita el JDK y el SDK de Android, no autorizados | — |

## Pruebas nuevas de capturas (`server/test/capture-flow.test.mjs`)

| Escenario | Resultado esperado según el código | Estado |
|---|---|---|
| El fugitivo se desconecta con una reclamación pendiente | La reclamación sigue; al reconectar la ve y puede confirmarla | ✔ |
| El fugitivo no vuelve en 30 s | Caduca, no hay captura y el cazador recibe «Sin respuesta» | ✔ |
| El cazador se desconecta con su reclamación pendiente | La confirmación vale y la ve al reconectar | ✔ |
| Final por el anfitrión con una reclamación pendiente | Se descarta; después, `claim_not_found`, `wrong_phase` y sin captura | ✔ |
| El tiempo se acaba con una reclamación pendiente | Ganan los fugitivos; la confirmación tardía no captura | ✔ |
| Reclamación de la partida anterior en la revancha | `claim_not_found`; sin captura | ✔ |
| Tras una captura | El capturado desaparece del mapa de su compañera (**fallaba**, corregido), no se puede recapturar ni duplicar, y pasa a espectador con 60 s de retraso | ✔ |

**Ya cubiertos antes** (`engine/test/capture.test.ts`, `server/test/capture-race.test.mjs`):
- captura válida, fuera de distancia, en el límite, con precisión insuficiente y con posición antigua;
- cazador sin posición;
- duplicados, confirmación, rechazo, simultáneas y abandono de un implicado.

## Fallos durante la sesión

- **`capture-flow`, «tras una captura»: falló antes de la corrección del servidor** (defecto real, n.º 1 del registro de trabajo).
- **`game.test`, la prueba nueva del GPS: falló antes de la corrección del cliente** (defecto real, n.º 2).
- **La 2.ª grabación** se hizo sin las comprobaciones automáticas, porque el parche del script no se aplicó. Se repitió; esa versión y las intermedias se conservan en `…-videos\version-*\`.
- **Mutación del límite de peticiones del GPS:** con el límite desactivado se acumulan 13 peticiones y la prueba nueva falla; con el límite, 3 como máximo.

## Limitaciones

- **Ninguna prueba usa la cartografía real de MapTiler:** no hay clave.
- **Ninguna prueba es en un teléfono:** ni GPS real, ni pantalla bloqueada, ni cobertura real, ni batería, ni latencia por datos móviles.
- La E2E de la demo (`demo/e2e/flow.e2e.cjs`) solo funciona con `NODE_PATH=mobile/node_modules`. No se ha repetido en esta sesión: no se tocó la demo.
