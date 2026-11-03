# Capturas de QA (28/10/2026, estado final)

Navegadores **emulando un móvil** (360×740) contra el servidor real en memoria. Jugadores, coordenadas y tiempo **ficticios**. **Ninguna muestra cartografía real ni es un teléfono.** No contienen claves.

## `partida-grabada/` — perspectiva de Ana (anfitriona y cazadora)

Fotogramas de `gameplay-auditoria.webm`: **mapa de prueba con calles sintéticas** y rótulo amarillo de simulación. Son **lo que se ve sin desplazar** la página. Los tiempos están en `HITOS.md`.

| Archivo | Estado |
|---|---|
| `01-pantalla-inicial.png` | Inicio |
| `02…`, `03-configuracion…` | Configuración de la partida (anfitrión) |
| `04-sala-de-espera-con-cuatro-jugadores.png`, `05-todos-listos…` | Sala con pocos jugadores (4) |
| `06-cuenta-atras.png`, `07-rol-revelado-cazador.png` | Inicio y rol |
| `08-huida…`, `09-huida-el-companero…` | Pantalla del cazador en la huida: compañero visible y leyenda |
| `10-persecucion.png` | Temporizador de la persecución y acción fija abajo |
| `11-sin-conexion…`, `12-conexion-recuperada.png` | Reconexión: aviso superior y en el mapa |
| `13-primera-pista…` | Pista en el mapa; el aviso en línea **no tapa el reloj**; acción visible sin desplazar |
| `14-lista-de-la-ultima-pista.png` | Lista de pistas |
| `15-reclamacion-lejos…` | Captura rechazada por el servidor (distancia) |
| `16-ana-llega-junto-a-carla.png` | Aproximación |
| `17-reclamacion-enviada…` | Captura pendiente (cazador) |
| `18-carla-confirma-captura.png` | Captura aceptada: un solo aviso «Captura: Carla» |
| `19-mission-report…`, `20-final-revancha…` | Resultados y revancha |

## `e2e-mapa/` — perspectiva de Caro (fugitiva)

Capturas de **página completa**: la tarjeta fija de abajo aparece donde estaba al capturar. Estilo de prueba **sin calles**.

| Archivo | Estado |
|---|---|
| `1-radar-de-reserva.png` | Sin configuración: radar con el motivo |
| `1b-clave-rechazada.png` | Clave rechazada (403 simulado): radar con el motivo |
| `2-mapa-cargado.png` | Pantalla del fugitivo: mapa, compañero, atribución arriba a la derecha y leyenda |
| `3-mapa-con-zoom…` | Zoom conservado tras las actualizaciones |
| `4-sin-conexion.png` | Sin conexión |
| `5-reclamacion-recibida-por-el-fugitivo.png` | Captura pendiente vista por el fugitivo |
| `5a-persecucion-accion-fija-abajo.png` | «Me han pillado» fija |

## `e2e-partida/` — `game.e2e.mjs` (cinco jugadores, mapa sin configurar, radar)

Sala vista por el anfitrión y por un jugador, cuenta atrás, roles, reclamación vista por los dos lados y final.

## `sala/` — sala con muchos jugadores (anfitriona + 19 clientes simulados, el máximo de 20)

- `sala-20-jugadores.png`: lo que se ve.
- `sala-20-jugadores-pagina-completa.png`: la página entera.

Sin desbordamiento (360 px). Cada fila del anfitrión ocupa dos líneas. **Los avisos «X ha entrado» se apilan** encima de la lista cuando entran muchos a la vez (P3).

**No hay captura de** la revancha ya empezada: `game.e2e` y `capture-flow` la cubren sin captura de pantalla.
