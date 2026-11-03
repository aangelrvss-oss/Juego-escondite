# Registro de trabajo · preparación de la prueba física (27–28/10/2026)

Rama `mapa-real`, commit `462016d` más cambios sin confirmar. **Sin commits ni push.** Antes de empezar, el estado coincidía byte a byte con la copia `C:\Users\aange\Downloads\outrun-respaldo-20261027-233111-auditoria\`.

**Línea base:** la batería completa de la auditoría (27/10, 23:15–23:35) sobre ese mismo código.

| Prueba | Línea base |
|---|---|
| `tsc` | OK |
| Motor | 144 |
| Servidor | 68 |
| Cliente | 109 |
| Demo | 62 |
| `web-flow` | 41 |
| `game` | 8/8 |
| `map` | 26 |
| `layout` | 6 |
| `boot` | 4 |

## Problemas tratados

| # | Problema | Evidencia | P | Archivos | Corrección | Validación |
|---|---|---|---|---|---|---|
| 1 | **Un jugador que deja de ser visible se queda dibujado para siempre** (un compañero capturado o un fugitivo que vuelve a la zona): el servidor no enviaba la lista de posiciones cuando quedaba vacía, y el móvil conservaba la última | Nueva prueba `capture-flow.test.mjs` («tras una captura…»): **falla sin la corrección** (la compañera no recibe ninguna lista y conserva al capturado) | **P1** | `server/hub.ts` | La lista vacía también se envía a quien juega o está capturado (a quien ha salido, nada) | 7/7 en `capture-flow`, servidor 75/75 (incluida `leave.test`: quien sale no recibe nada) |
| 2 | **La renovación del GPS del navegador podía quedarse bloqueada para siempre** si el navegador no respondía a una petición de posición: con el móvil quieto, la posición dejaba de renovarse. Es un candidato a la causa del fallo intermitente (R-03) | Nueva prueba en `game.test.mjs`: **falla sin la corrección** | **P1** | `mobile/www/js/location.js` | Una petición sin respuesta pasado su plazo (10 s + 2 s) se da por perdida y se puede pedir otra. Nunca hay más de una pendiente, y una respuesta tardía conserva su antigüedad real | Cliente 110/110; `map.e2e` 5 de 5. **La causa del fallo intermitente sigue sin confirmar**: una sonda de 20 peticiones en Chromium respondió siempre |
| 3 | La acción de captura quedaba debajo del mapa en un móvil de 360×740 (UX-01) | Capturas de la auditoría (15 y 18) | **P1** | `app.js`, `game.css` | La tarjeta de acción de cada rol queda **fija abajo** al desplazarse; mapa más bajo (46 % de la altura); tarjeta del cazador compacta | `map.e2e` (fugitivo) y la grabación (cazadora): acción visible sin desplazar y botones del mapa sin tapar |
| 4 | Los avisos tapaban el reloj, el rol y el resultado, y se apilaban (UX-03) | Capturas 13, 18 y 19 de la auditoría; `e2e-partida-5-navegadores/05` | P2 | `app.js`, `game.css` | En la partida, los avisos van **en línea** bajo la cabecera, con altura reservada y solo el último (tras la revisión R4). Si el reloj está fuera de pantalla, flotan arriba | `map.e2e`: «los avisos no tapan el reloj ni el rol»; capturas 13 y 18 nuevas |
| 5 | Dos avisos por captura y sin concordancia de género (UX-09) | Captura 18 de la auditoría | P3 | `app.js` | Un solo aviso: «Captura: Carla» (o «Te han capturado») | Captura 18 nueva |
| 6 | Etiqueta «Encuentro» solapada con tu marcador; sin leyenda (UX-04/05) | Capturas 09 y 13 de la auditoría | P2 | `map-view.js`, `app.js`, `game.css` | Marcador de encuentro sin texto, y **leyenda** bajo el mapa según el rol | `map.e2e` (marcador y leyenda); capturas |
| 7 | La atribución del mapa abajo quedaría tapada por la acción fija | Detectado tras el cambio 3 | P1 (licencia) | `game.css` | Atribución en la esquina superior derecha; aviso de conexión debajo | `map.e2e`: «la acción fija no tapa los botones del mapa ni la atribución» |
| 8 | Capturas sin pruebas para la desconexión, el final o la revancha con una reclamación pendiente, y para el fugitivo sin posición | Inventario de pruebas frente al motor | P1 (cobertura) | `server/test/capture-flow.test.mjs` (nuevo, 7), `engine/test/capture.test.ts` (+1) | — | Todas pasan |
| 8b | **Regresión introducida en la sesión anterior:** con 20 jugadores, los nombres de la sala se partían a mitad de palabra («Dieg / o») | Captura de la sala con 20 jugadores (nueva) | P2 | `game.css` | El nombre tiene un ancho mínimo y solo se parte entre palabras; si no cabe, el estado y el selector bajan de línea | Captura `sala/sala-20-jugadores.png`; `layout` 6/6; `web-flow` 41/41 (12 pantallas sin desbordar, botones de 44 px o más y texto de 12 px o más) |
| 9 | El script de grabación verificaba la interfaz solo a ojo | — | — | `mobile/e2e/gameplay-capture.mjs` | Comprobación medida en la pantalla de la cazadora | ✔ en la grabación |

## Revisión independiente de los cambios (un revisor aparte, solo lectura)

No encontró nada grave. Hizo seis observaciones, todas comprobadas y corregidas:

| # | Observación | Corrección | Validación |
|---|---|---|---|
| R1 | La corrección del GPS (n.º 2) podía dejar **peticiones colgadas sin límite**, y una respuesta tardía desbloqueaba el refresco con otra petición en curso | Identificador por petición; solo la petición en curso desbloquea; **2 abandonadas como máximo** | Prueba nueva; mutación sin límite: 13 peticiones y falla |
| R2 | Una respuesta tardía **más vieja** podía sustituir a una lectura más reciente (la posición retrocedía) | Nunca se entrega una lectura medida antes que la última | La prueba lo comprueba. Se ajustó la prueba anterior del refresco para que su lectura simulada sea posterior a la del seguimiento, como en un navegador real; sigue comprobando la antigüedad |
| R3 | La región `aria-live` de los avisos en línea solo existía con avisos (los lectores de pantalla pueden no anunciarlos) | La región siempre está presente durante la partida | Revisión del código |
| R4 | Los avisos en línea movían la página: se podía pulsar un nombre que se había movido | Altura reservada para un aviso; solo el último | Capturas finales |
| R5 | La leyenda del capturado era incorrecta | En gris, «Jugadores (hace 60 s)», sin «Tú» | Revisión del código |
| R6 | La atribución en dos líneas podía solaparse con el aviso del mapa | Aviso del mapa a 48 px del borde superior | `map.e2e` 29/29; captura 11 |

## Revisados sin cambios

- **La E2E de la demo** necesita `NODE_PATH=mobile/node_modules`: Playwright solo está en `mobile/`. Se documenta y no se instala nada más.
- **Las marcas antitrampas** (`implausible_speed`, `mock_location`, `repeated_tag_rejections`) se **registran** en el motor y viajan en el evento de final, pero **la interfaz no las muestra y no bloquean nada**. Queda documentado como detección pasiva, no como protección.
- **Sala de espera larga** (UX-08): las reglas siguen abiertas, porque «todos ven las reglas antes de empezar» es un requisito que comprueba `web-flow`. Pendiente de decisión.
- **Momentos sin información** (UX-07): dependen de la frecuencia de las pistas (D-047). No se cambian reglas.
- **Etiquetas cortadas en el borde del mapa:** P3, sin corregir.
- **El hueco reservado para avisos** ocupa unos 46 px aunque no haya ninguno (es el coste de que la página no salte). P3.
- **Durante un corte de red**, el aviso rojo superior empuja el mapa hacia abajo y la acción fija tapa los botones del mapa mientras dura. Es transitorio. P3.
