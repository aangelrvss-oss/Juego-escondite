# Estado del proyecto

**Última actualización:** 24/10/2026 (sesión 4: cierre de diseño)
**Rama:** `ccr-f1962362-hvwb9i`
**Nombre del producto:** provisional, sin decidir.

## Fase activa

**Cierre de diseño (sesión 4): documentado y pendiente de aprobación** (D-030 a D-037 y parámetros).
La etapa S0 está completada en simulación y guardada en Git (`f0ca70e`).
Siguiente etapa posible: **S1** (Android real). **No se ha iniciado** y requiere una nueva autorización.

La app móvil **no ha comenzado**. No hay cuentas creadas, ni servicios contratados, ni despliegues, ni conexiones externas. Gasto acumulado: **0 €**.

## Estado del repositorio al empezar la sesión 3

- Rama `ccr-f1962362-hvwb9i` en el commit `3969906`, al día con `origin` (0/0) y árbol limpio.

## Sesión 3: trabajo realizado (S0)

- **Motor de reglas** (`engine/src/`): máquina de estados, reloj inyectado, temporizadores del servidor, visibilidad por equipo, pistas, salida de zona, capturas con confirmación, abandono, anfitrión sustituto, caducidad y revancha.
- **Simulación** (`sim/`): servidor autoritativo en memoria (códigos, sesiones con secreto con hash, idempotencia, `seq` por destinatario, reanudación, envío agrupado de posiciones, purga de coordenadas) y clientes simulados (desfase de reloj, detección de duplicados y huecos). Incluye bots deterministas para partidas completas.
- **Pruebas:** 103 automatizadas, todas superadas y todas **SIMULADAS**. Verificación por mutación de 3 invariantes. Detalle en `QUALITY_STATE.md`.
- **Hallazgos de diseño:** D-020 (`seq` por destinatario), D-021 (regla de antigüedad de las muestras) y D-023 (aclaraciones y una incoherencia documental).
- **Dependencias:** solo de desarrollo: `typescript@5.9.3` y `@types/node@22.19.1` (más su dependencia `undici-types@6.21.0`), instaladas con `--ignore-scripts`. `node_modules/` está excluido por `.gitignore`.

## Sesión 4: cierre de diseño (sin código)

- **Estado al empezar:** `ccr-f1962362-hvwb9i` en `f0ca70e`, al día con `origin` (0/0) y árbol limpio.
- **Documento nuevo:** `docs/product/GAME_MODES_AND_RULES.md`, la fuente única de reglas (Clásico, Infección, equipos, rondas, zona dinámica, pistas, escáner, disputas y avisos).
- **Documentos actualizados (de forma aditiva):** `PRODUCT_STRATEGY.md`, `MVP_SCOPE.md`, `USER_FLOWS.md` (F15–F20), `ACCEPTANCE_CRITERIA.md` (secciones I–N, en borrador), `GAME_STATE_MACHINE.md` (§9), `QUALITY_STATE.md`, `DECISION_LOG.md` (D-024 a D-037), `BACKLOG.md` y este archivo.
- **Motor y pruebas de S0: sin cambios.** No se han instalado dependencias, ni creado cuentas, ni desplegado, ni gastado nada.

## Decisiones

- **Aprobadas por el propietario:** D-002, D-003, D-004 (en parte), D-006, D-007, D-008, D-009, D-010, D-011 y D-024 a D-029 (diseño de juego de la sesión 4, sin parámetros).
- **Pendientes:** D-004 (invitado), D-005 (cliente), D-012 a D-019, D-020 a D-023 y D-030 a D-037. **D-030 cambia una decisión aprobada** (modos alternativos fuera del MVP).

## Riesgos y bloqueos

- S0 está **guardada en Git** (commit `f0ca70e`, subido a `origin/ccr-f1962362-hvwb9i`). Los documentos de la sesión 4 están **sin confirmar** hasta que se autorice su commit.
- El riesgo crítico sigue abierto: la ubicación con el móvil bloqueado. **S0 no lo reduce.**
- El adaptador de servidor sigue sin decidir (D-014): no se ha probado ningún transporte real.
- El coste de CPU del motor (clona el estado en cada comando) no se ha medido en un adaptador real.

## Siguiente acción concreta

1. El propietario revisa `docs/product/GAME_MODES_AND_RULES.md` y decide D-030 (alcance) y D-031 a D-037.
2. El propietario fija los parámetros abiertos (§11 de ese documento).
3. Autorización (o no) para el commit de la sesión 4.
4. Después: S1 (no cambia con este diseño). Requiere responder a las preguntas pendientes sobre el Android, el ordenador o Mac y las cuentas gratuitas.
