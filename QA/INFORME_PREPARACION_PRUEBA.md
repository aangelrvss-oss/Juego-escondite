# THE OUTRUN · Preparación de la primera prueba física · 28/10/2026

## Estado: LISTO CON LIMITACIONES · NO VERIFICADO FÍSICAMENTE

Se puede hacer **una prueba física controlada con dos o más teléfonos en el navegador**, con el **radar** como mapa y, si se configura la clave, con el mapa real.

No se conoce ningún fallo crítico **reproducible** que invalide una partida. Pero:
- **nada se ha probado en un teléfono**;
- **la cartografía real de MapTiler no se ha visto** (falta la clave);
- el fallo intermitente del GPS tras una reconexión **no tiene causa confirmada**, aunque se ha corregido un defecto real que lo explica.

**No es «completamente probado».**

## Qué se ha corregido (detalle en `REGISTRO_TRABAJO.md`)

| Prioridad | Corrección | Evidencia |
|---|---|---|
| **P1** | Un jugador que dejaba de ser visible (compañero capturado, fugitivo que vuelve a la zona) **se quedaba dibujado para siempre**: el servidor no enviaba la lista vacía | Prueba nueva que fallaba antes; servidor 75/75 |
| **P1** | **El GPS del navegador podía dejar de renovarse para siempre** si el navegador no respondía a una petición. Ahora la petición perdida se reintenta con un **límite de peticiones colgadas** y **nunca se entrega una lectura más vieja que la última** | 2 pruebas nuevas que fallaban antes; mutación sin límite: 13 peticiones |
| **P1** | **La acción de captura quedaba bajo el mapa:** ahora la tarjeta de cada rol queda **fija abajo** y no tapa los botones del mapa ni la atribución | `map.e2e` (fugitivo) y grabación (cazadora), medidos |
| **P1 (licencia)** | Atribución del mapa arriba a la derecha, siempre visible | `map.e2e` |
| P2 | Los avisos **ya no tapan el reloj ni el rol** (en línea, altura reservada, solo el último). Al desplazarse, flotan arriba | `map.e2e` |
| P2 | Leyenda del mapa; «Encuentro» sin etiqueta solapada; nombres de la sala sin partir con 20 jugadores (regresión propia, corregida) | Capturas |
| P3 | Un solo aviso por captura, con texto neutro («Captura: Carla») | Captura 18 |
| Cobertura | **7 pruebas nuevas de capturas** con servidor real (desconexiones, final y fin del tiempo con una reclamación pendiente, revancha, estado tras capturar) y 1 del motor (fugitivo sin posición) | Todas pasan |

Una **revisión independiente** de los cambios (otro revisor, solo lectura) encontró 6 puntos, sin nada grave: los 6 están corregidos.

**No se ha cambiado ninguna regla**: distancias, fases, roles, victoria, visibilidad y confirmación de la captura siguen igual.

## Qué se ha probado (`RESULTADOS_PRUEBAS.md`)

**Automatizado y simulado, todo en verde:**

| Prueba | Resultado |
|---|---|
| TypeScript | OK |
| Motor | 145/145 |
| Servidor | 75/75 |
| Cliente | 111/111 |
| Demo | 62/62 |
| `web-flow` | 41/41 |
| Partida con 5 navegadores | 8/8 |
| Mapa (cartografía de prueba) | 29/29 en 4 de 4 ejecuciones |
| Maquetación a 360 px | 6/6 |
| Arranque del diagnóstico | 4/4 |

Hay una grabación de la partida completa (`C:\Users\aange\Downloads\outrun-qa-20261028-videos\`, **simulación con calles sintéticas**).

## Qué sigue pendiente

- **Mapa real** (MapTiler): falta la clave.
- **Todo lo físico:** GPS real, precisión en la zona, cobertura, bloqueo de pantalla, otra app, batería, datos, latencia por el túnel y gestos reales.
- **APK Android** (la que mantiene el GPS con la pantalla bloqueada): falta el JDK y el SDK.
- **iPhone / Safari:** nunca probado.
- **D-035** (disputas de captura): sin decidir (`DECISIONES_PENDIENTES.md`).

## Riesgos críticos

1. **En el navegador, la pantalla tiene que ir encendida:** con ella apagada no se envía la ubicación y no se puede capturar a ese jugador.
2. **Precisión:** para reclamar hacen falta 30 m o mejor en los dos jugadores y lecturas de menos de 15 s. Entre edificios puede fallar.
3. **GPS tras una reconexión:** el fallo intermitente simulado (2 de 18) no tiene causa confirmada; está corregido un defecto que lo explicaría. **Caso F-17.**
4. **Una captura depende de que el fugitivo la confirme** (D-035) y **el servidor no puede comprobar el GPS de un móvil**: las marcas de velocidad imposible solo se registran, no protegen. Es aceptable entre conocidos.
5. **Un portátil y un túnel temporal:** si se cae el túnel, la dirección cambia y hay que volver a entrar.

## Condiciones antes de empezar

- [ ] Zona conocida, de día, sin calzadas ni vías; punto de encuentro acordado; todos mayores de 18; lista de seguridad repasada en persona.
- [ ] Portátil enchufado y sin suspensión; `.\server\iniciar-servidor.ps1 -SoloComprobar` en «Todo correcto».
- [ ] (Si se quiere el mapa real) clave de MapTiler configurada y restringida (`ARRANQUE_PRUEBA.md` §2), comprobada en el ordenador antes de salir.
- [ ] Canal de voz externo acordado (la app no tiene radio).
- [ ] La checklist `CHECKLIST_PRUEBA_FISICA.md` impresa o abierta en otro dispositivo.
