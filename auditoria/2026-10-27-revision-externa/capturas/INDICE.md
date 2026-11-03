# Índice de capturas

Todas son de **navegadores emulando un móvil** (360×740 salvo que se indique otra cosa), contra el servidor real en memoria. Los jugadores, las coordenadas y el tiempo son **ficticios**. **Ninguna muestra cartografía real.**

## `partida-grabada/` — fotogramas de la partida grabada (perspectiva de Ana, anfitriona y cazadora)

Mapa de prueba con **calles sintéticas** y rótulo amarillo de simulación. Los tiempos de cada una están en `partida-grabada/HITOS.md`.

| Archivo | Qué muestra | Pantalla de la lista |
|---|---|---|
| `01-pantalla-inicial.png` | Inicio: nombre, mayoría de edad, crear o unirse | Pantalla inicial |
| `02-sala-creada-configuracion-del-anfitrion.png` | Sala recién creada, con el código | Configuración |
| `03-configuracion-zona-de-400-m-10-min-pistas-cada-2-min.png` | Zona centrada, radio, duraciones y lista de seguridad | Configuración |
| `04-sala-de-espera-con-cuatro-jugadores.png` | Sala con 4 jugadores y roles asignados | Lobby |
| `05-todos-listos-el-anfitrion-puede-empezar.png` | «Empezar partida» activo | Lobby |
| `06-cuenta-atras.png` | Cuenta atrás de 5 s | Inicio de partida |
| `07-rol-revelado-cazador.png` | Tarjeta privada del rol | Inicio de partida |
| `08-huida-mapa-con-la-zona-los-fugitivos-no-se-ven.png` | Mapa en la huida; la cazadora no ve a los fugitivos | Mapa durante la partida |
| `09-huida-el-companero-cazador-bruno-aparece-en-el-mapa.png` | El compañero visible; **etiquetas solapadas en el centro** (UX-04) | Cazadores |
| `10-persecucion.png` | Fase de persecución | Mapa |
| `11-sin-conexion-aviso-y-posiciones-congeladas.png` | Corte de red: aviso superior y en el mapa, marcadores en gris | Conexión |
| `12-conexion-recuperada.png` | Tras reconectar | Conexión |
| `13-primera-pista-posiciones-de-los-fugitivos-en-el-mapa.png` | Pista: fugitivos como marcadores huecos con su antigüedad; **el aviso tapa el reloj** (UX-03); **etiqueta cortada** en el borde (UX-04) | Pistas |
| `14-lista-de-la-ultima-pista.png` | Lista de la pista bajo el mapa | Pistas |
| `15-reclamacion-lejos-de-diego-el-servidor-la-rechaza.png` | Reclamación rechazada («No estáis lo bastante cerca…»); **acción bajo el mapa** (UX-01) | Captura |
| `16-ana-llega-junto-a-carla.png` | Aproximación; con la zona entera se aprecia poco (UX-06) | Movimiento |
| `17-reclamacion-enviada-esperando-a-que-carla-confirme.png` | «Esperando a que Carla confirme (0:2x)» | Captura |
| `18-carla-confirma-captura.png` | Captura confirmada; **dos avisos redundantes** (UX-09) | Captura |
| `19-mission-report-ganan-los-cazadores.png` | Mission Report; **el aviso tapa el título** (UX-03) | Resultado |
| `20-final-revancha-disponible-para-el-anfitrion.png` | «Compartir resultado» y «Revancha» | Volver a jugar |

## `e2e-mapa/` — prueba del mapa (perspectiva de Caro, fugitiva)

Estilo de prueba **sin calles** (fondo liso).

| Archivo | Qué muestra |
|---|---|
| `1-radar-de-reserva.png` | Sin configuración: radar SVG con el motivo y «Reintentar el mapa» |
| `1b-clave-rechazada.png` | Proveedor que rechaza la clave (403 simulado): radar con el motivo |
| `2-mapa-cargado.png` | Mapa MapLibre: zona, compañero (Beto), tu posición, botones y atribución de prueba visible. **La cazadora no aparece** |
| `3-mapa-con-zoom-tras-actualizaciones.png` | El zoom del jugador se mantiene tras las actualizaciones |
| `4-sin-conexion.png` | Sin conexión: aviso y marcadores en gris |
| `5-reclamacion-recibida-por-el-fugitivo.png` | «¿Te ha pillado Ana?» con cuenta atrás de 30 s, y «Sí, me ha pillado» o «No» (**perspectiva del perseguido**) |

## `e2e-partida-5-navegadores/` — `game.e2e.mjs` (cinco jugadores)

Con el **mapa sin configurar** (se ve el radar de reserva).

| Archivo | Qué muestra |
|---|---|
| `01-inicio-Ana.png` | Inicio |
| `02-sala-Ana.png`, `02-sala-Caro.png` | Sala vista por el anfitrión y por un jugador |
| `03-cuenta-Dani.png` | Cuenta atrás |
| `04-rol-Ana.png`, `04-rol-Caro.png` | Rol de cada uno (solo el suyo) |
| `05-reclamacion-Ana.png`, `05-reclamacion-Caro.png` | Reclamación vista por cazador y por fugitivo. En la de Ana, **tres avisos apilados tapan casi todo el radar** (UX-03) |
| `06-final-Eva.png` | Final |

## `e2e-demo/` — demo antigua «Rastro»

42 capturas de la **demo simulada anterior**, en dos tamaños (`compacto-` 360×740 y `xiaomi14t` 412×915). **No es el juego actual**; se incluye porque su prueba se ejecutó.
