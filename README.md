# Juego de escondite urbano (nombre provisional)

Proyecto de juego social de escondite y persecución en la vida real con geolocalización, pensado para España y con Madrid como primer mercado.

**Estado:** S0 completada en simulación. **H1** (app Android de diagnóstico GPS con Capacitor, con la identidad visual THE OUTRUN) compila, se ha instalado en un Xiaomi 14T y ha superado una **prueba física preliminar** (sesión corta). H1 es un diagnóstico local: **todavía no hay multijugador, servidor ni salas reales**, y H2 sigue pendiente. Hay una **demo visual simulada** para el móvil (sin GPS ni red).

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
- [docs/product/GAME_MODES_AND_RULES.md](./docs/product/GAME_MODES_AND_RULES.md): reglas de juego (fuente única)
- [docs/technical/S1_ANDROID_PROTOCOL.md](./docs/technical/S1_ANDROID_PROTOCOL.md): protocolo de S1 en Android
- [android/](./android/README.md): prototipo de S1 (núcleo Java y app)
- [mobile/](./mobile/README.md): app H1 de diagnóstico GPS (Capacitor) y sus [pruebas físicas en el Xiaomi 14T](./mobile/PRUEBAS_XIAOMI_14T.md)
- [demo/](./demo/README.md): demo visual **simulada** de una partida (un solo HTML; cómo abrirla en el móvil)

## Etapa S0: motor de reglas y simulación

- `engine/`: motor de reglas puro (sin E/S, con reloj inyectado).
- `sim/`: servidor autoritativo y clientes **simulados** (en memoria, sin red).

```
npm install --ignore-scripts
npm run typecheck
npm test
```

Los resultados y sus límites están en [QUALITY_STATE.md](./QUALITY_STATE.md). Nada de S0 valida GPS real, segundo plano ni batería.

## Demo visual (simulada)

```
npm run build:demo   # genera demo/dist/rastro-demo.html
npm run test:demo
```

Es un HTML autocontenido: se abre directamente en el navegador. Todo es ficticio (posiciones, jugadores y cercanía). Ver [demo/README.md](./demo/README.md).

## H1: app Android de diagnóstico GPS

App Capacitor con un módulo nativo de ubicación propio y una pantalla de diagnóstico, sin red. Comandos, pruebas y límites en [mobile/README.md](./mobile/README.md); resultados en [QUALITY_STATE.md](./QUALITY_STATE.md).
