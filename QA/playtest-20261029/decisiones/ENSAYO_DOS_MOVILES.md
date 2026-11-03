# THE OUTRUN · Ensayo con dos móviles por el túnel público

> **Objetivo:** antes de quedar con el grupo, comprobar en 30–40 min la versión actual por el túnel, con dos móviles reales. No es una partida «de verdad»: se busca que todo funcione.
>
> **Personas:** una persona con los dos móviles, o dos personas. El portátil se queda en casa (o en el punto de encuentro) con el servidor y el túnel.
>
> Cada paso indica dónde se puede comprobar:
> - **[Ahora · navegador]:** se puede comprobar ya en el ordenador.
> - **[Móviles]:** necesita los dos móviles físicos.
>
> Lo marcado **[Móviles]** **no está validado** hasta que lo hagas.

## 0. Antes de empezar (portátil)

1. **Reinicia el servidor.** El que está en marcha arrancó el 28/10 y **todavía usa el motor anterior**: sin la revancha con sorteo, sin los equipos al final y sin las demás correcciones del 29/10. Ciérralo en su ventana y vuelve a lanzar `.\server\iniciar-servidor.ps1`. Comprueba antes `-SoloComprobar` → «Todo correcto».
2. Si el túnel se reinicia, **la dirección cambia**. Anótala cada vez.
3. Los dos móviles: batería ≥ 70 %, datos móviles (no la wifi de casa), ahorro de batería desactivado y bloqueo de pantalla al máximo.

## 1. La dirección pública del túnel está activa

- **[Ahora · navegador]** En el portátil, abre `https://<tu-túnel>.trycloudflare.com/health` → tiene que responder `{"ok":true…}`.
  - Hoy hay un proceso `cloudflared` en marcha desde el 28/10 a las 22:25, pero **no sé su dirección y no la he comprobado**.
  - Si me pasas la dirección, lo compruebo desde aquí (solo `/health`).
- **[Móviles]** Lo mismo desde cada móvil con datos. Si en el portátil funciona y en el móvil no, el problema es la red del móvil o la dirección mal copiada.

## 2. El origen del móvil está permitido en MapTiler

- **[Ahora · tú, en la web de MapTiler]** Añade `https://<tu-túnel>.trycloudflare.com` a los orígenes permitidos de la clave. Yo no toco la clave ni sus restricciones.
- **[Ahora · navegador]** En el portátil, abre la dirección del túnel, crea una sala de prueba con dos pestañas (una de ellas en incógnito) y empieza: en la huida tienen que verse calles y «© MapTiler © OpenStreetMap contributors».
  - Si sale el **radar** con «la clave no es válida o no está autorizada», falta el origen.
  - Puedo hacer esta comprobación en Chrome, como la de localhost, si me das la dirección.
- **[Móviles]** Lo mismo en cada móvil: calles visibles en la huida.

## 3. Los dos móviles entran en la misma partida

- **[Móviles]**
  - **Móvil A:** «Crear sala» → «Compartir enlace» o «Mostrar QR».
  - **Móvil B:** entra con el enlace o el QR.
  - Los dos ven la lista con los dos nombres y «Conectado».
  - A centra la zona, configura 10 min de persecución, 2 min de huida y pistas cada 2 min, y marca la lista de seguridad.
  - Los dos pulsan «Estoy listo» (con «GPS ±N m», N ≤ 30).
  - Para el ensayo, A asigna a mano: A cazador y B fugitivo.
- **[Ahora · navegador, simulado]** Ya cubierto por `web-flow` (enlace, QR, código, 3 jugadores), 42/42.

## 4. Las posiciones se actualizan

- **[Móviles]**
  - Durante la huida, el cazador A ve **solo su posición**. El fugitivo B ve la suya.
  - Moveos 50–100 m: el punto propio se mueve, y la barra de GPS dice «GPS ±N m», no «Lectura antigua».
  - El cazador **no** ve al fugitivo (salvo que salga más de 30 s de la zona).
- **[Ahora · navegador, simulado]** `map.e2e` (29/29) y `game.e2e` (8/8) lo cubren con GPS emulado.

## 5. Una pista y su temporizador

- **[Móviles]**
  - En la persecución, los dos ven bajo el reloj la cuenta atrás:
    - cazador: «Próxima pista en 1:5x»;
    - fugitivo: «Los cazadores reciben tu posición en 1:5x».
  - **Los dos contadores tienen que coincidir (±1 s).**
  - Al llegar a 0:00, el cazador ve «Nueva pista: posición de 1 fugitivo», un punto hueco en el mapa y la tarjeta «Pista nº 1 · llegó hace …» bajo el mapa.
  - Comprobad que el punto está donde estaba B.
- **[Ahora · navegador, simulado]** `playtest-ui` (13/13) lo comprueba con el reloj adelantado.

## 6. La revelación de la ubicación y el aviso al fugitivo

- **[Móviles]**
  - A ~1 min de la pista, el fugitivo recibe «Pista en 1 min: …» (vibra y se pone rojo).
  - Al llegar la pista: vibración y la franja roja «Los cazadores acaban de recibir tu posición. Muévete.» durante 30 s.
  - Anotad si se nota con el móvil en la mano y con el móvil en el bolsillo (pantalla encendida).
  - Tras recargar la página, tocad la pantalla una vez: el navegador no deja vibrar hasta el primer toque.
- **[Móviles, opcional]** El fugitivo sale de la zona más de 30 s:
  - B ve «Llevas demasiado fuera: los cazadores te ven» y A lo ve en directo;
  - al volver, A ve «B ha vuelto a la zona».
- **[Ahora · navegador, simulado]** `playtest-ui` comprueba el aviso de 1 min, la franja y el anuncio accesible.

## 7. Una captura completa

- **[Móviles]**
  - A y B juntos (a menos de ~5 m), parados.
  - A pulsa el nombre de B en «¿Has pillado a alguien?».
  - B ve la hoja «¿Te ha pillado A?» con el plazo grande y pulsa «Sí, me ha pillado».
  - Los dos ven «Capturas: 1», y la partida termina (era el único fugitivo).
  - Si sale un rechazo, anotad el texto exacto («No estáis lo bastante cerca…», «precisión…», «ubicación antigua…»).
  - Repetid una vez con «No», para ver «Captura rechazada».
- **[Ahora · navegador, simulado]** `game.e2e`, `web-flow` y `playtest-ui` lo cubren con GPS emulado.

## 8. Cortar la conexión de un móvil y recuperarla

- **[Móviles]** En una segunda partida (revancha), en la persecución, B **parado y en un sitio seguro** activa el **modo avión 60 s**. Anotad:
  - cuándo aparece en B «Sin conexión con el servidor…» (puede tardar hasta ~40 s, o no salir si el corte es corto: no es un fallo);
  - que la partida de A sigue con normalidad (el reloj no se para);
  - al quitar el modo avión, cuánto tarda B en volver a «Conectado» y a «GPS ±N m»;
  - si el reloj de B coincide otra vez con el de A.
- **No probado en ningún sitio:** en el navegador de prueba, el modo sin conexión **no corta** el WebSocket a `localhost`. Solo se puede validar con los móviles.

## 9. Los dos dispositivos muestran un estado coherente

- **[Móviles]**
  - Tras la reconexión, comparad las dos pantallas: misma fase, mismo reloj (±1 s), mismo «Capturas: N».
  - El cazador sigue viendo la última pista.
  - Si había una reclamación pendiente, B la sigue viendo.
- **[Ahora · navegador, simulado]** Pruebas del servidor con reconexión (`reconnect.test`, `capture-flow.test`) y `playtest-decisions.test` (el resultado tras reconectar).

## 10. La partida termina y el resumen se presenta bien

- **[Móviles]**
  - Al terminar, los dos ven el **mismo** Mission Report, con el resultado arriba y «Cazadores / Fugitivos» con los equipos de los dos.
  - Arriba, «Tu partida», distinta en cada móvil.
  - **Recargad la página en uno:** el informe tiene que ser idéntico.
  - A pulsa «Revancha» y B «Unirme a la revancha». En la sala, los dos aparecen con «Sorteo». Al empezar, el reparto es un sorteo nuevo: puede repetirse el mismo.
  - Para el paso 8, asignad a mano.
- **[Ahora · navegador, simulado]** `playtest-ui` (13/13), `web-flow` (42/42) y `playtest-decisions` en el servidor (3/3).

## Hoja de resultados del ensayo

| Paso | OK / Fallo | Qué se vio (texto exacto) | Hora |
|---|---|---|---|
| 1 Túnel activo | | | |
| 2 MapTiler en el móvil | | | |
| 3 Misma partida | | | |
| 4 Posiciones | | | |
| 5 Pista y temporizador | | | |
| 6 Aviso al fugitivo | | | |
| 7 Captura | | | |
| 8 Modo avión y reconexión | | | |
| 9 Estado coherente | | | |
| 10 Final y resumen | | | |

Si los pasos 1–7 y 10 salen bien, se puede quedar con el grupo (`PROTOCOLO_PRIMER_PLAYTEST.md`). Si el 8 o el 9 fallan, se puede jugar igualmente: avisad de que, tras perder la cobertura, hay que esperar a «Conectado» y, si no vuelve, recargar.
