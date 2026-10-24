# Juego de escondite urbano (nombre provisional)

Proyecto de juego social de escondite y persecución en la vida real con geolocalización, pensado para España y con Madrid como primer mercado.

**Estado:** etapa S0 de la prueba técnica completada (motor de reglas y simulaciones, sin red ni app móvil). La app móvil no ha comenzado.

## Documentación

- [PROJECT_STATE.md](./PROJECT_STATE.md): estado actual y siguiente acción
- [DECISION_LOG.md](./DECISION_LOG.md): decisiones y propuestas
- [BACKLOG.md](./BACKLOG.md): tareas priorizadas
- [QUALITY_STATE.md](./QUALITY_STATE.md): pruebas y limitaciones
- [docs/research/COMPETITIVE_ANALYSIS.md](./docs/research/COMPETITIVE_ANALYSIS.md): auditoría de SCRAM y de la competencia
- [docs/research/PHASE0_REPORT.md](./docs/research/PHASE0_REPORT.md): enfoques de producto, MVP, arquitectura preliminar y costes (histórico)
- [docs/product/](./docs/product/): estrategia, alcance del MVP, flujos de usuario y criterios de aceptación
- [docs/technical/GAME_STATE_MACHINE.md](./docs/technical/GAME_STATE_MACHINE.md): máquina de estados y modelo de ubicación
- [docs/technical/TECHNICAL_SPIKE_PLAN.md](./docs/technical/TECHNICAL_SPIKE_PLAN.md): plan de la prueba técnica, arquitecturas y costes

## Etapa S0: motor de reglas y simulación

- `engine/`: motor de reglas puro (sin E/S, con reloj inyectado).
- `sim/`: servidor autoritativo y clientes **simulados** (en memoria, sin red).

```
npm install --ignore-scripts
npm run typecheck
npm test
```

Los resultados y sus límites están en [QUALITY_STATE.md](./QUALITY_STATE.md). Nada de S0 valida GPS real, segundo plano ni batería.
