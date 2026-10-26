# Backlog

**Reordenado el 26/10/2026 (noche)** con las prioridades de la guía de criterio (`docs/product/THE_OUTRUN_Guia_de_criterio_y_desarrollo.docx`, §4), «sujeto a revisión tras las pruebas reales». Se conservan todas las tareas pendientes de la versión anterior (25/10), cada una en su prioridad.

Prioridades:
- **P0:** auditoría y coherencia; HUNT multijugador completo; fiabilidad, recuperación, seguridad y privacidad.
- **P1:** pruebas reales con varios dispositivos y jugadores; corregir lo observado.
- **P2:** siguiente modo, elegido por su valor.
- **P3:** FOX HUNT, SARDINES y extras.

Estados:
- `[ ]` pendiente;
- `[~]` hecho sin evidencia suficiente (por ejemplo, solo en simulación o en el navegador del ordenador);
- `[x]` hecho y verificado con la evidencia adecuada al tipo de afirmación (guía §3 y §14).

## P0 · Auditoría y coherencia documental
- [x] Auditoría frente al Plan Maestro, matriz de trazabilidad y contradicciones registradas (D-043 a D-047; `PLAN_MAESTRO_TRAZABILIDAD.md`).
- [x] Alternativas y recomendaciones de las decisiones pendientes (`docs/product/DECISIONES_PENDIENTES.md`).
- [x] Guía de criterio incorporada y contrastada (D-043 y D-045 ampliadas, D-053 y D-054).
- [ ] **El propietario decide** D-043 (radio), D-044 (PWA), D-045 (siguiente modo), D-046 (número de jugadores), D-047 (pistas y capturados), D-053 (pausa), el procedimiento de D-035 (disputas) y PAUSED. También confirma o revierte las decisiones técnicas de las sesiones autónomas (D-054).
- [x] Revisar el contrato técnico frente al código (`GAME_STATE_MACHINE.md` §10, 26/10 noche). Pendientes que salen de ahí:
  - actualizar el diseño (D-033, D-049, persistencia, `new_code` y versión de reglas);
  - decidir si hace falta un registro de auditoría;
  - guardar la sesión en el almacenamiento seguro del sistema y no en `localStorage` (AC-H4).
- [ ] Decidir D-020 a D-023 (propuestas de la sesión 3). Revisión de los resultados de S0 por el propietario.
- [ ] Preguntas de reglas pendientes, para decidir y no implementar todavía: «sin respuesta en 30 s = sin captura» (§11, pregunta 7), aviso al fugitivo cuando le escanean (§8.2), árbitro de disputas, y proporciones y parámetros definitivos.
- [ ] El propietario fija los parámetros abiertos (`GAME_MODES_AND_RULES.md` §11; D-038).
- [ ] Actualizar los comentarios de código que dicen «fuera del MVP» (`engine/src/constants.ts`, `engine/test/zone.test.ts`), según D-032.
- [ ] Revisar si siguen vigentes las preguntas de la sesión 2 (ordenador y Mac, segundo Android, cuentas gratuitas de Expo y Cloudflare) y la revisión pendiente de sus documentos.

## P0 · HUNT multijugador completo
- [~] Sala privada, enlace, QR y código renovable; roles secretos; cuenta atrás; huida; pistas; captura con confirmación; final; Mission Report; revancha. **Solo hay evidencia automática y en Chrome de escritorio: ninguna partida con móviles.**
- [ ] Disputas según D-035, cuando se apruebe el procedimiento (§9.3).
- [ ] Pistas aproximadas y qué ven los capturados, cuando se decida D-047.
- [ ] Radio por equipos: primero un prototipo aislado, si se decide D-043.
- [ ] Mensaje de capacidad de la sala, cuando se decida D-046.
- [ ] Zona dinámica (D-032; su inclusión en la primera versión está por decidir) y cazadores fuera de la zona sin poder capturar (D-033).
- [ ] Reparto automático o manual con proporción configurable (D-031) y políticas de ronda A y B (D-037).
- [ ] Filtro básico de palabras ofensivas en los nombres.

## P0 · Fiabilidad, recuperación, seguridad y privacidad
- [~] Hecho en las sesiones del 26/10, sin dispositivo:
  - persistencia (también ante la caída real del proceso);
  - reconexión y recarga sin repetir eventos;
  - comandos idempotentes tras un reinicio;
  - filtro de saltos del GPS;
  - límites por dirección;
  - registro sin coordenadas;
  - permiso retirado;
  - pantalla encendida y lectura con el móvil quieto en el navegador.
- [ ] **Defecto conocido:** si una partida termina más de 6 h después de crear la sala, el Mission Report se sustituye enseguida por «sala cerrada». Para corregirlo hay que decidir un margen (D-038).
- [ ] Pausa o cancelación clara (D-053).
- [ ] Seguridad de la zona más allá de los avisos (guía §7: «una advertencia no arregla una mecánica peligrosa»), por ejemplo un constructor de zonas que excluya vías. Necesita decisión.
- [ ] Política de conservación y borrado de datos, `PRIVACY_AND_COMPLIANCE.md` y `THREAT_MODEL.md`. Revisión legal antes de abrir al público.
- [ ] Medir el coste de CPU del motor en el alojamiento elegido (D-014).

## P1 · Pruebas reales con varios dispositivos y jugadores
- [ ] **Analizar el CSV de la prueba física de H1** (guía §6). No está en el repositorio ni en este ordenador: lo aporta el propietario.
- [ ] Partida con dos móviles en el navegador (`mobile/PRUEBA_PARTIDA_NAVEGADOR.md`). Necesita autorización para el túnel HTTPS. Es la primera vez que se escanearía el QR con una cámara.
- [ ] Partida con dos Android con la pantalla bloqueada (`mobile/PRUEBA_PARTIDA_ANDROID.md`).
- [ ] Puerta de la Fase 2 del Plan: dos partidas consecutivas completas sin reiniciar el servidor y sin contradicciones entre dispositivos.
- [ ] Verificaciones previas sin coste (`TECHNICAL_SPIKE_PLAN.md` §7; el plan de la prueba técnica está diseñado y sin ejecutar).
- [ ] Caminata de H1 (15–20 min) para calibrar la precisión. S1-T01 a S1-T14 en el Xiaomi 14T y decidir V2, V1 o un cambio de técnica.
- [ ] S2 (dos Android por la calle) y S3 (iPhone; requiere decidir entre Mac y Apple Developer Program).
- [ ] Sesiones con personas ajenas al desarrollo (guía §9), con el protocolo de observación escrito antes de cada ronda.
- [ ] E1 (partidas con SCRAM o HideZone) y E2 (entrevistas a organizadores).
- [ ] Ejecutar las pruebas Java y las E2E con Playwright. Necesita autorización para instalar JDK, SDK y Playwright.
- [ ] ADR de la arquitectura con los resultados medidos.

## P1 · Corregir lo observado
- [ ] Vacío hasta tener resultados de las pruebas reales. Lo observado va antes que cualquier ampliación (guía §4).

## P2 · Siguiente modo
- [ ] Elegir entre THE RACE e INFECTION por valor demostrado, coste y riesgo, después de HUNT (D-045). El diseño de Infección y del escáner (D-034) está en `GAME_MODES_AND_RULES.md`.
- [ ] Nombre definitivo y búsqueda de marcas (EUIPO/OEPM).

## P3 · FOX HUNT, SARDINES y extras
- [ ] Modos candidatos del Plan (§5.4 en adelante).
- [ ] Demo visual (simulada):
  - que el propietario la abra en el Xiaomi 14T;
  - decidir si `demo/dist/` va en Git y si la demo se instala como app (PWA o APK);
  - gameplay 2 (disputa limitada a la pareja) y 3 (rastro propio del fugitivo);
  - fase visual 2;
  - rediseño profundo (`DESIGN_SYSTEM.md`).
- [ ] Documentos de arquitectura (`ARCHITECTURE.md`, `DATA_MODEL.md`, `REALTIME_PROTOCOL.md`, `LOCATION_SYSTEM.md`), modelo de negocio (enfoque C) y plan de lanzamiento en Madrid.

## Hecho (histórico)
- [x] Fase 0: investigación competitiva (sesión 1). Decisiones de producto del propietario (sesión 2). Diseño de modos y reglas (sesión 4) y D-030 a D-038 aprobadas (sesión 5).
- [x] S0: motor TypeScript, servidor simulado y bots (`f0ca70e`; simulado). Demo visual simulada (sesiones 6, 7 y 12).
- [~] S1: núcleo Java y app compilados (sesión 9). **Sin pruebas en el dispositivo.**
- [~] H1: diagnóstico GPS con una prueba física corta en el Xiaomi 14T (`4c190a0`).
- [~] H2: servidor y cliente multijugador; recuperación y commits locales en `recuperacion-h2` (26/10). Detalle en `PROJECT_STATE.md`.
