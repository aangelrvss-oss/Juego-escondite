# Juego de escondite urbano (nombre provisional)

Proyecto de juego social de escondite y persecución en la vida real con geolocalización, pensado para España y con Madrid como primer mercado.

**Estado:**
- **H2:** partida multijugador con servidor autoritativo (`server/`) y cliente (`mobile/`, app Android y web).
  - Probada con 5 clientes reales y 5 navegadores en un ordenador; **todavía no se ha jugado con móviles reales**.
  - La prueba con dos Android está preparada en [`mobile/PRUEBA_PARTIDA_ANDROID.md`](./mobile/PRUEBA_PARTIDA_ANDROID.md).
- **H1:** el diagnóstico GPS superó una prueba física preliminar en un Xiaomi 14T.
- **S0:** completada en simulación.
- Hay una **demo visual simulada**, sin GPS ni red.

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
- [server/](./server/README.md): servidor de partida y **guía para jugar**
- [mobile/](./mobile/README.md): app de la partida y del diagnóstico GPS (Capacitor) y sus [pruebas físicas en el Xiaomi 14T](./mobile/PRUEBAS_XIAOMI_14T.md)
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

## Jugar (H2)

```
node server/main.ts          # servidor (Node ≥ 22.18, sin dependencias) en http://127.0.0.1:8787
npm run test:server          # pruebas del servidor con clientes reales por WebSocket
```

Guía completa (túnel HTTPS, APK, crear y compartir sala, permisos, registros y limitaciones): [server/README.md](./server/README.md).

## App móvil (H1 y H2)

App Capacitor con módulo nativo de ubicación propio. Incluye la partida (`index.html`) y el diagnóstico GPS (`diagnostic.html`). Comandos, pruebas y pasos para iOS en [mobile/README.md](./mobile/README.md); resultados en [QUALITY_STATE.md](./QUALITY_STATE.md).
