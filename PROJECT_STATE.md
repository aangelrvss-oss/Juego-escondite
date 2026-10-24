# Estado del proyecto

**Última actualización:** 24/10/2026 (sesión 3: etapa S0)
**Rama:** `ccr-f1962362-hvwb9i`
**Nombre del producto:** provisional, sin decidir.

## Fase activa

**Etapa S0 de la prueba técnica: completada en simulación, pendiente de revisión.**
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

## Decisiones

- **Aprobadas por el propietario:** D-002, D-003, D-004 (en parte), D-006, D-007, D-008, D-009, D-010 y D-011.
- **Pendientes:** D-004 (invitado), D-005 (cliente), D-012 a D-019 y D-020 a D-023.

## Riesgos y bloqueos

- **Sin confirmar en Git:** los archivos de S0 solo existen en este contenedor efímero. Para no perderlos hace falta autorizar un commit.
- El riesgo crítico sigue abierto: la ubicación con el móvil bloqueado. **S0 no lo reduce.**
- El adaptador de servidor sigue sin decidir (D-014): no se ha probado ningún transporte real.
- El coste de CPU del motor (clona el estado en cada comando) no se ha medido en un adaptador real.

## Siguiente acción concreta

1. El propietario revisa los resultados de S0 (`QUALITY_STATE.md`) y las decisiones D-020 a D-023.
2. Autorización (o no) para el commit y push de S0.
3. Si se aprueba S1: responder a las preguntas pendientes (Android y modelo, ordenador o Mac, cuentas gratuitas de Expo y Cloudflare) y verificar sin coste los puntos de `TECHNICAL_SPIKE_PLAN.md` §7.
