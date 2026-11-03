# Preparación de la partida física · 31/10/2026 (madrugada)

## Estado comprobado
| Qué | Estado | Cómo se comprobó |
|---|---|---|
| Servidor (127.0.0.1:8787) | **Reiniciado con el código actual** | El anterior (PID 31160) llevaba en marcha desde el 29/10 a las 18:23, antes de los modos nuevos, el periodo de gracia y las correcciones. Se detuvo tras comprobar que tenía 0 salas, 0 sesiones y 0 clientes. El nuevo (PID 2284) se arrancó con `server\iniciar-servidor.ps1`: `TRUST_PROXY=1`, diagnóstico en `%USERPROFILE%\OutrunDiagnostico\`, sin archivo de estado. Está en su propia ventana de PowerShell |
| Túnel | **Nuevo** | El anterior (`equation-harry-…`) tenía 0 conexiones y su dirección ya no existía. El nuevo (cloudflared, PID 11084) está conectado y también tiene su propia ventana |
| Dirección pública | `https://interval-facilitate-loading-performs.trycloudflare.com` | `/health`, `/`, `/js/app.js` (con las correcciones del último ciclo), la biblioteca del mapa y su configuración responden 200 desde Internet |
| Mapa real (MapTiler) | **Funciona** con la dirección nueva | Captura `capturas/03-huida-anfitrion.png` y respuestas 200 en el navegador. A las 23:58 el estilo respondía 403 para este origen; unos minutos después, 200. No se ha tocado la configuración de MapTiler |
| Flujo del juego por la dirección pública | 9/9 (`registros/01-flujo-publico.txt`) | Dos navegadores Chromium independientes, con ubicación emulada |

Pasos del flujo comprobados:
1. Inicio, con 3 modos jugables y sin Sardines.
2. Crear la sala.
3. Entrar con el código desde el otro navegador.
4. Los dos aparecen en la sala.
5. El anfitrión empieza.
6. Cuenta atrás y roles privados.
7. Mapa real.
8. Terminar, con informe, y salir.
9. Sin errores de JavaScript.

**No se ha probado con móviles reales.** La prueba deja una sala de prueba terminada que caduca sola.

## Antes de salir (en el portátil)
1. **Enchúfalo y que no se suspenda.** Ahora va con batería y se suspende a los 10 min sin uso, lo que tiraría el servidor y el túnel. Elige una:
   - Configuración → Sistema → Inicio/apagado y batería → «Suspender» → **Nunca** (con batería y enchufado);
   - o, en PowerShell: `powercfg /change standby-timeout-ac 0` y `powercfg /change standby-timeout-dc 0`.
2. **No cierres** las dos ventanas de PowerShell nuevas (servidor y túnel) ni cambies de red Wi-Fi.
3. Si el túnel se reinicia, **cambia la dirección**. Además, MapTiler solo acepta las direcciones autorizadas: habría que añadir la nueva en «Allowed HTTP origins» (ver `mobile/MAPA.md`). Sin eso, la partida funciona con el radar de respaldo.

## Instrucciones para los participantes
1. Abrid en el móvil, con Chrome (Android) o Safari (iPhone): **https://interval-facilitate-loading-performs.trycloudflare.com**.
   - O mejor, el enlace o el QR que comparte el anfitrión desde la sala: ya lleva el código.
2. Escribe tu nombre, marca que tienes 18 años o más y pulsa **Unirme** (con el código de la sala).
3. **Permite la ubicación** cuando el navegador la pida, en modo «preciso».
4. Pulsa **Estoy listo** en la sala.
5. Durante la partida, **pantalla encendida y navegador en primer plano**: con la pantalla apagada, el navegador deja de enviar la ubicación. Llevad batería.
6. Jugad **al aire libre**. En portales, en el metro o en interiores el GPS se pierde, y entonces no te pueden capturar (problema conocido, ver abajo).
7. Para capturar: toque suave, nunca en la calzada. El cazador pulsa el nombre del fugitivo y el fugitivo confirma «Sí, me ha pillado». Responded siempre a las reclamaciones.

## Anfitrión: crear la sala y empezar
1. En tu móvil, abre la dirección, escribe tu nombre, elige el modo, marca la casilla de los 18 años y pulsa **Crear partida**.
2. Comparte la sala con **Compartir enlace** o **Mostrar QR**.
3. Estando ya en el lugar de juego, pulsa **Centrar la zona aquí**.
4. Revisa la configuración y marca la lista de **seguridad**.
5. Pulsa **Estoy listo**. Cuando todos estén listos, pulsa **Empezar partida**.

Notas:
- La sala de espera caduca a los 30 min sin actividad: crea la sala ya en el sitio.
- Una partida no puede empezar si no cabe en las 6 h de vida de la sala (con la duración máxima, pasadas unas 4 h 25 min desde que se creó).
- Si alguien pulsa «Abandonar», puede volver a entrar con el código en la sala de la revancha.

## Modo recomendado
- **Primera partida: Clásico.**
  - Es el más probado: tiene un playtest previo y todas las pruebas automáticas, de navegador y de 10 bots.
  - Va de 2 a 20 jugadores, con una duración corta (15–20 min) y pistas cada 2–3 min.
- **Segunda: Infección**, si sois 4 o más. Está verificado en las pruebas y el informe de contagio está corregido, pero nunca se ha jugado con personas.
- **Caza del zorro:** solo como prueba de funcionamiento, no para juzgar su equilibrio. Con el zorro sin GPS (en un interior) o con el sondeo mediante «Reclamar», la partida se decide sola. Son las decisiones de producto pendientes B1 y B2.
  - Si la jugáis, que el zorro se comprometa a jugar al aire libre con el GPS activo.
  - Que los cazadores no pulsen «Reclamar» sin estar al lado del zorro.

## Problemas conocidos que pueden afectar
- **Fugitivo sin GPS válido** (P1, pendiente de decisión): no se le puede capturar y gana por tiempo.
- **«Reclamar» revela la cercanía:** dice si el fugitivo está cerca. Pactad no usarlo para sondear.
- **Pantalla apagada:** el navegador deja de enviar la ubicación. A los 30 s el jugador aparece «sin conexión» y a los 5 min queda fuera.
- **Hora:** es de noche. La app avisa del juego nocturno; jugad en una zona iluminada y segura.
- **Ninguna partida completa se ha jugado aún con estos modos en móviles reales.**
- **Dónde mirar si algo falla:** el diagnóstico de la prueba se guarda en `%USERPROFILE%\OutrunDiagnostico\`. Al parar el servidor con Ctrl+C se genera su informe.

## Al terminar
1. Ctrl+C en la ventana del túnel y luego en la del servidor.
2. Vuelve a dejar la suspensión como estaba si la cambiaste: 15 min enchufado y 10 min con batería.
3. Opcional: quitar la dirección del túnel de los orígenes permitidos de MapTiler.
