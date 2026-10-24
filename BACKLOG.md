# Backlog

Prioridad: P0 (lo siguiente) · P1 (antes del MVP) · P2 (más adelante).
Estados: `[ ]` pendiente · `[~]` documentado o planificado, **no ejecutado** · `[x]` hecho y verificado.

## Hecho
- [x] Fase 0: investigación competitiva (`COMPETITIVE_ANALYSIS.md`, `PHASE0_REPORT.md`). Sesión 1.
- [x] Decisiones de producto del propietario registradas (D-002/003/004 en parte/006/007/008/009/010/011). Sesión 2.

## P0: cerrar la sesión 2 y preparar la prueba técnica
- [ ] Revisión del propietario de los documentos de producto y técnicos de la sesión 2.
- [x] Commit y push de los documentos de la sesión 2 (commit `3969906`).
- [ ] Respuestas a: ¿hay ordenador (y Mac)?, ¿un segundo Android?, ¿se pueden crear cuentas gratuitas de Expo y Cloudflare?
- [~] Plan de la prueba técnica (`TECHNICAL_SPIKE_PLAN.md`): diseñado, sin ejecutar.

## P0: cierre de diseño (sesión 4)
- [~] Diseño de modos, equipos, rondas, zona dinámica, pistas, escáner y disputas documentado en `docs/product/GAME_MODES_AND_RULES.md`. **Pendiente de aprobación.**
- [ ] El propietario decide D-030 (alcance: Infección, zona dinámica y escáner en el MVP) y D-031 a D-037.
- [ ] El propietario fija los parámetros abiertos (`GAME_MODES_AND_RULES.md` §11).
- [ ] Tras aprobarse: actualizar los comentarios de código que dicen "fuera del MVP" (`engine/src/constants.ts`, `engine/test/zone.test.ts`). No se tocan en esta sesión.

## P1: prueba técnica (sesiones siguientes, una etapa por sesión)
- [x] S0: motor TypeScript, servidor simulado y bots. 103 pruebas superadas, **todas SIMULADAS** (sesión 3). Sin transporte de red real.
- [x] S0 guardada en Git: commit `f0ca70e` en `ccr-f1962362-hvwb9i` (sesión 3).
- [ ] Revisión de los resultados de S0 por el propietario.
- [ ] Decidir D-020 a D-023. La incoherencia sobre quién se expone fuera de la zona tiene propuesta de solución en D-033 (sesión 4).
- [ ] Medir el coste de CPU del motor dentro del adaptador elegido (S1).
- [ ] Filtro básico de palabras ofensivas en los nombres (pendiente en el motor).
- [ ] Verificaciones previas sin coste (`TECHNICAL_SPIKE_PLAN.md` §7).
- [ ] S1: Android real + bot contra el servidor publicado en el plan gratuito (T01, T02, T04, T05, T07, T08, T11, T12 y T13).
- [ ] S2: dos Android reales por la calle.
- [ ] S3: iPhone (T06). Requiere decidir entre Mac y Apple Developer Program.
- [ ] ADR de la arquitectura con los resultados medidos.

## P1: producto y validación (en paralelo, sin código)
- [~] Estrategia, alcance, flujos, criterios y máquina de estados: documentados, pendientes de aprobar.
- [ ] E1: 2 o 3 partidas con SCRAM o HideZone con amigos adultos en Madrid (lo ejecuta el propietario).
- [ ] E2: 5–8 entrevistas a organizadores adultos (enfoque C).
- [ ] Búsqueda de marcas (EUIPO/OEPM) para el nombre.

## P1: implementación del diseño de la sesión 4 (después de S1 y de las aprobaciones)
- [ ] Zona dinámica: generador de calendario con reglas de seguridad, avisos, reevaluación y cazadores sin capturar fuera de la zona.
- [ ] Asignación automática o manual con proporción y límites. Políticas de ronda A y B (C cuando se apruebe su regla).
- [ ] Disputas con enfriamiento.
- [ ] Modo Infección (si D-030 lo incluye).
- [ ] Escáner mínimo (si D-030 lo incluye).

## P2
- [ ] `DESIGN_SYSTEM.md` e identidad visual (después de la prueba técnica).
- [ ] `ARCHITECTURE.md`, `DATA_MODEL.md`, `REALTIME_PROTOCOL.md`, `LOCATION_SYSTEM.md` y ADR.
- [ ] `THREAT_MODEL.md` y `PRIVACY_AND_COMPLIANCE.md`, más asesoría legal antes del lanzamiento.
- [ ] `BUSINESS_MODEL.md` (enfoque C).
- [ ] `MADRID_LAUNCH_PLAN.md`.
- [ ] ~~Primera ampliación tras el MVP: zona que se reduce.~~ Sustituido en la sesión 4: la zona dinámica se propone dentro del MVP (D-030).
