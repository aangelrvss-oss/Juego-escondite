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
- [x] Diseño de modos, equipos, rondas, zona dinámica, pistas, escáner y disputas documentado en `docs/product/GAME_MODES_AND_RULES.md`. Decisiones D-030 a D-038 aprobadas en la sesión 5; los parámetros numéricos siguen siendo hipótesis.
- [x] El propietario decidió D-030 a D-037 (sesión 5).
- [ ] El propietario fija los parámetros abiertos (`GAME_MODES_AND_RULES.md` §11).
- [ ] Actualizar los comentarios de código que dicen "fuera del MVP" (`engine/src/constants.ts`, `engine/test/zone.test.ts`). Según D-032, la zona dinámica es parte del diseño previsto, aunque su inclusión en la primera versión no está decidida. Se hará al retomar el motor; el motor de S0 no se toca en la sesión 5.

## P0: demo visual (sesión 6)
- [x] Demo visual **simulada** del modo Clásico en un solo HTML (`demo/`). 21 pruebas unitarias y e2e en Chromium con emulación móvil.
- [ ] El propietario la abre en el Xiaomi 14T y da su opinión (**no probada en el dispositivo**).
- [ ] Decidir si se instala como app: PWA (requiere despliegue HTTPS, no autorizado) o APK con WebView (requiere desbloquear D-040).
- [ ] Decidir si el HTML compilado (`demo/dist/`) se guarda en Git o se ignora.
- [ ] Nombre definitivo (la demo usa "Rastro", provisional y sin búsqueda de marcas).
- [x] Pasada visual y de UX de la demo (sesión 7): paleta reducida, componentes unificados, HUD de partida simplificado, estados diferenciados y mapa más legible.
- [ ] Rediseño profundo futuro (no abordado en la sesión 7): `DESIGN_SYSTEM.md` con tokens, tipografía propia incrustada (offline), iconografía propia, etiquetas del mapa sin solapes (colisiones), panel inferior arrastrable, orientación horizontal, modo claro para pleno sol y revisión con lector de pantalla. Dividir `demo/src/ui.js` en módulos si la demo sigue creciendo.

## P1: mejora visual y de juego de la demo (sesión 12, investigación con 3 agentes)
- [x] Fase visual 1: paleta neutra con un solo color de marca (lima), sin ámbar; contraste AA; HUD, cuenta atrás, sala, mapa y final unificados; avisos emergentes que duplicaban la indicación, silenciados.
- [x] Gameplay 1: bots más creíbles, sin tocar parámetros (D-038). Fase 2A: fugitivos que se esconden y cambian de sitio de vez en cuando. Fase 2B: cazadores que se reparten las pistas («va quien esté más cerca», solo con información de su equipo). Evaluador reproducible: `node demo/eval/bots.mjs` (60 semillas, 8 jugadores, 20 min). Es simulación de bots, no equilibrio entre personas.
- [ ] Gameplay 2: limitar el efecto de una disputa a la pareja implicada (hoy protege al fugitivo de todos y bloquea al cazador), según el procedimiento propuesto en GAME_MODES_AND_RULES §9.3.
- [ ] Gameplay 3: mostrar al fugitivo su propio rastro (qué posición suya recibieron los cazadores y cuándo), nunca datos de cazadores.
- [ ] Pendiente de decisión, no implementar: regla «sin respuesta en 30 s = sin captura» (§11, pregunta 7); aviso al fugitivo cuando le escanean (§8.2); árbitro de disputas; proporciones y parámetros definitivos.
- [ ] Visual, fase 2: etiquetas del mapa sin solapes, marca común de «provisional» para todos los números, foco y Escape en los modales, uso del mapa con teclado.

## P1: prueba técnica (sesiones siguientes, una etapa por sesión)
- [x] S0: motor TypeScript, servidor simulado y bots. 103 pruebas superadas, **todas SIMULADAS** (sesión 3). Sin transporte de red real.
- [x] S0 guardada en Git: commit `f0ca70e` en `ccr-f1962362-hvwb9i` (sesión 3).
- [ ] Revisión de los resultados de S0 por el propietario.
- [ ] Decidir D-020 a D-023. La incoherencia sobre quién se expone fuera de la zona tiene propuesta de solución en D-033 (sesión 4).
- [ ] Medir el coste de CPU del motor dentro del adaptador elegido (fase de red y servidor, cuando se resuelva D-014; ya no forma parte de S1).
- [ ] Filtro básico de palabras ofensivas en los nombres (pendiente en el motor).
- [ ] Verificaciones previas sin coste (`TECHNICAL_SPIKE_PLAN.md` §7).
- [x] D-030 a D-038 aprobadas y documentadas (sesión 5).
- [~] S1 (sesión 5): núcleo Java probado (13 de 13, simulado). App escrita y comprobada con `javac`. **APK sin compilar** (D-040).
- [ ] Desbloquear la compilación: habilitar `dl.google.com` en el entorno o usar Android Studio (lo decide el propietario).
- [ ] Ejecutar S1-T01 a S1-T14 en el Xiaomi 14T y analizar los CSV.
- [ ] Decidir V2, V1 o un cambio de técnica según los criterios de salida de S1.
- [ ] ~~S1: Android real + bot contra el servidor publicado en el plan gratuito.~~ Redefinida en la sesión 5: solo el dispositivo, sin red (`S1_ANDROID_PROTOCOL.md`). Las pruebas de red y servidor pasan a la fase que resuelva D-014.
- [ ] S2: dos Android reales por la calle.
- [ ] S3: iPhone (T06). Requiere decidir entre Mac y Apple Developer Program.
- [ ] ADR de la arquitectura con los resultados medidos.

## P1: producto y validación (en paralelo, sin código)
- [~] Estrategia, alcance, flujos, criterios y máquina de estados: documentados, pendientes de aprobar.
- [ ] E1: 2 o 3 partidas con SCRAM o HideZone con amigos adultos en Madrid (lo ejecuta el propietario).
- [ ] E2: 5–8 entrevistas a organizadores adultos (enfoque C).
- [ ] Búsqueda de marcas (EUIPO/OEPM) para el nombre.

## P1: implementación del diseño de la sesión 4 (después de S1 y de las aprobaciones)
- [ ] Zona dinámica (diseño previsto, D-032; inclusión en la primera versión por decidir; parámetros en hipótesis): calendario con reglas conservadoras, avisos y reevaluación. Cazadores fuera de la zona sin poder capturar (D-033).
- [ ] Asignación automática o manual con proporción configurable (D-031; distribución por definir y probar). Políticas de ronda A y B (D-037; C pospuesta).
- [ ] Disputas según D-035: pendientes hasta resolverse, con autoridad explícita (procedimiento en §9.3, propuesto).
- [ ] Modo Infección: **ampliación futura** (D-030). No forma parte de la primera versión jugable.
- [ ] Escáner (pistas aproximadas, usos limitados): **diseño futuro** (D-034).

## P2
- [ ] `DESIGN_SYSTEM.md` e identidad visual (después de la prueba técnica).
- [ ] `ARCHITECTURE.md`, `DATA_MODEL.md`, `REALTIME_PROTOCOL.md`, `LOCATION_SYSTEM.md` y ADR.
- [ ] `THREAT_MODEL.md` y `PRIVACY_AND_COMPLIANCE.md`, más asesoría legal antes del lanzamiento.
- [ ] `BUSINESS_MODEL.md` (enfoque C).
- [ ] `MADRID_LAUNCH_PLAN.md`.
- [ ] ~~Primera ampliación tras el MVP: zona que se reduce.~~ Sustituido: la zona dinámica es parte del diseño previsto (D-032, sesión 5). Su inclusión en la primera versión jugable no está decidida de forma expresa.
