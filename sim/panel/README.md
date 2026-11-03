# Simulador local de THE OUTRUN (herramienta de desarrollo)

Partida de **10 participantes** (AVATAR_01 … AVATAR_10) que se ve y se controla desde el navegador de este
ordenador. **No forma parte del juego** ni se publica: escucha solo en `127.0.0.1` y no toca el servidor de
pruebas reales (`:8787`), el túnel ni la configuración del mapa.

## Arrancar, abrir y detener

```powershell
# desde la carpeta del repositorio
npm run sim:panel                 # o: node sim/panel/servidor.mjs [puerto]   (por defecto 8790)
```

- **Dirección:** abre **http://localhost:8790/sim/**.
  - Usa `localhost` y no `127.0.0.1`: la clave del mapa admite el origen `localhost`, y con `127.0.0.1:8790` el proveedor la rechaza y el panel avisa de que muestra un plano de prueba.
- **Detenerlo:** pulsa Ctrl+C en la ventana donde lo arrancaste. Cierra todas sus conexiones y su servidor, y no afecta a ningún otro proceso.
- **Si el puerto está ocupado:** `node sim/panel/servidor.mjs 8791`, y abre `http://localhost:8791/sim/`. Con un puerto distinto, el mapa puede no cargar por la misma restricción de origen.

## Uso

1. Elige el modo (**Clásico**, **Infección** o **Caza del zorro**) y quién juegas tú desde la interfaz real.
   - Puedes elegir cualquiera de AVATAR_02 a AVATAR_10, o «Nadie» para que los 10 sean bots.
   - AVATAR_01 es el anfitrión y lo maneja el simulador: crea la sala, configura y empieza la partida, y es quien puede terminarla.
2. Pulsa **Iniciar con 10 participantes**.
   - Se crea la sala, entran los 10, cada uno marca «listo» y el anfitrión empieza.
   - Los roles los asigna el motor con sus reglas.
   - Para cambiar de modo, elige otro y vuelve a pulsar Iniciar: la simulación anterior se cierra entera.
3. **Tiempo:**
   - Pausar y Reanudar paran el reloj del servidor.
   - ×1 a ×20 aceleran el reloj; mientras va acelerado, un rótulo amarillo dice «TIEMPO ACELERADO».
   - +30 s, +1 min y +5 min adelantan el tiempo a pasos de 5 s, y los bots siguen moviéndose y enviando su GPS en cada paso.
4. **Participante seleccionado** (pulsa su fila en la tabla):
   - Forzar desconexión.
   - Suspender pestaña: el socket sigue abierto, pero la app no envía nada.
   - Restaurar conexión.
   - Pestaña duplicada: la misma sesión en otra conexión; el servidor cierra la anterior con el código 4001.
   - Jugar como él.
5. **Captura válida:** un cazador bot va hasta un fugitivo y reclama al llegar.
   - Solo en esta prueba conoce la posición real del fugitivo.
   - El motor valida la captura con sus reglas y el fugitivo bot la confirma.
6. **Captura inválida:** un cazador reclama a un fugitivo lejano. El motor la rechaza, y el motivo aparece en la consola.
7. **Finalizar partida:** el anfitrión termina la partida. El motor la cierra sin ganador (`ended_by_host`).
8. **Mapa:**
   - En «Vista de control» se ven todos con su GPS simulado; esa vista no la ve ningún jugador.
   - «Lo que ve AVATAR_0X» muestra solo lo que el servidor autoriza a ese jugador, con el mismo filtro (`visiblePositions`) que en una partida.
   - Haz clic en el mapa para mover al participante que juegas desde la interfaz.
9. **Reiniciar:** arranca un servidor de simulación nuevo, sin salas, sesiones ni conexiones anteriores.

## Qué es real y qué es simulado

| Real (el mismo código que en una partida) | Simulado |
|---|---|
| Servidor: `server/main.ts`, `server/hub.ts`, WebSocket y límites | GPS de los 10: coordenadas sintéticas alrededor del punto de referencia de las pruebas (no son la ubicación de nadie) |
| Motor y reglas: `engine/src`, incluidos los modos y el periodo de gracia | Decisiones de los bots: esconderse, perseguir pistas, huir (zorro), reclamar y confirmar |
| Capa de red del cliente: cada participante es un `GameConnection` de `mobile/www/js/net.js` | Reloj del servidor: pausa, aceleración y avances |
| Interfaz real de la app, para quien juegas tú (`/` sirve `mobile/www`) | «Vista física» de 35 m: un cazador bot ve a un fugitivo cercano, como en la calle (no es información del juego) |
| Mapa (`map-view.js`) y radar (`radar.js`) del juego | Pestaña suspendida: el bot deja de enviar mensajes con el socket abierto |

- **Ninguna acción salta las reglas:** los bots solo envían lecturas y comandos que el motor valida.
- **Resultados:** no se fuerza ninguno. Si nadie confirma una captura (por ejemplo, si juegas tú y no respondes), caduca como en una partida real.

## Arquitectura

- `servidor.mjs`: arranca el servidor real del juego con dos opciones de desarrollo.
  - `routes`, para servir el panel en `/sim/` y la interfaz con `shim.js` en `/`.
  - Un reloj controlable (`hub.now`) y un reloj real para el límite de mensajes (`hub.rateNow`).
  - Las acciones (`POST /sim/api/*`) solo se aceptan desde el propio panel (mismo origen).
- `simulacion.mjs`: el reloj, los 10 participantes, los bots, las acciones de prueba y el estado que lee el panel.
  - El estado completo sale de `hub.roomStateByCode` (vista de control).
  - La vista de un jugador sale de `visiblePositions` del motor.
- `www/shim.js`: solo lo sirve este simulador, y actúa antes de que arranque la app.
  - Le da a la interfaz real la sesión del participante que juegas.
  - Sustituye el GPS del navegador por el simulado.
  - Hace que `Date.now` siga el reloj de la simulación.
  - Pone el rótulo «SIMULACIÓN».
- `www/index.html`, `panel.js`, `panel.css`: el panel, con los tokens, el logotipo y los componentes del juego.

## Limitaciones conocidas

- **Una sola interfaz real a la vez.** Los demás participantes se ven en el panel, no en su propia app.
  - Diez apps con mapa en un mismo ordenador necesitarían mucha memoria.
  - Para ver lo que ve otro jugador, usa el selector del mapa (el filtro real del servidor) o «Jugar como».
- **Desconectar o suspender a quien juegas en la interfaz** se hace desde el navegador: modo sin conexión de las herramientas de desarrollo, o cerrar la pestaña.
- **Con el tiempo acelerado**, la app real no da señal de vida lo bastante a menudo (manda un ping cada 10 s reales).
  - El simulador la da por quien tiene el socket abierto y no está suspendido; lo dice el rótulo «TIEMPO ACELERADO».
  - A ×1 no interviene: la detección de presencia es la real.
- **El GPS simulado no tiene ruido ni pérdidas**, así que no sustituye a las pruebas físicas con móviles.

## Pruebas

```powershell
npm run test:sim-panel                       # simulador sin navegador (motor y servidor reales)
cd mobile; node e2e/simulador.e2e.mjs        # panel en Chromium a 1280 y 360 px
```
