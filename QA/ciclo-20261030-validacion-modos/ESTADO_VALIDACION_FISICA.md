# Estado de la validación física · 30/10/2026

**Resumen:**
- En este ciclo **no se ha hecho ninguna prueba con personas ni con móviles reales**.
- Todo lo que se ha validado ha sido con bots, en este ordenador.
- **Ningún modo tiene la validación física completada.**

## 1. Qué se ha probado y cómo
| Qué | Con bots o simulado (este ciclo) | Con personas y móviles reales |
|---|---|---|
| Clásico, partida completa con 10 jugadores y revancha | Sí: servidor, motor y `net.js` reales; GPS, reloj y decisiones simulados (registro 21) | Solo hay constancia indirecta: D-057 menciona «el primer playtest físico con cinco personas», previo a este ciclo y anterior al periodo de gracia. **No hay en el repositorio un registro verificable de sus resultados.** El informe del 29/10 (`QA/playtest-20261029/`) decía que la partida completa no se había jugado en la calle |
| Infección, partida completa con 10 jugadores y revancha | Sí (registros 12 y 21) | **No probado** |
| Caza del zorro, partida completa con 10 jugadores y revancha | Sí (registros 20 y 21) | **No probado** |
| Interfaz real de Infección y zorro | Chromium de escritorio, con viewport de móvil (registros 30 y 31) | **No probado** en móvil |
| Presencia (30 s / 5 min) | Bots desconectados o congelados; reloj simulado | **No probado** (modo avión, pantalla bloqueada, metro) |
| GPS real (ruido, saltos, interiores, precisión) | No. El GPS de los bots no tiene ruido ni pérdidas | **No probado** en partida. Solo el diagnóstico GPS del Xiaomi 14T (H1) |

## 2. Tiempo real, tiempo simulado y señales de vida
- **Tiempo simulado:** las partidas de 10 jugadores avanzan el reloj del servidor en pasos de 5 s. La espera de 60 s, los 30 s y los 5 min se miden con ese reloj. Los límites exactos de la espera se probaron con el motor puro (59 999 / 60 000 ms).
- **Señales de vida de los bots:** en las simulaciones, el simulador da señal de vida en nombre de los bots conectados que no están suspendidos (`keepAliveConnected`). Por tanto, **no** se ha validado la cadencia real del cliente (un ping cada 10 s en tiempo real) a lo largo de una partida, y V-17 indica un desfase de hasta 5 s.
- **Clientes reales:** en las e2e, la app real en Chromium envía sus pings reales con el reloj real. No se ha probado en un navegador de móvil ni en la app nativa.

## 3. Qué probar con personas, en este orden
**Antes de salir:**
- arrancar el servidor con el script oficial (`TRUST_PROXY=1`, `STATE_FILE`);
- comprobar el túnel con dos móviles;
- anotar el modelo de cada móvil y si usa navegador o app.

1. **Clásico, de 5 a 6 personas**:
   - partida completa y revancha;
   - un jugador en modo avión 45 s y luego 6 min (presencia y periodo de gracia);
   - anotar si los relojes coinciden y cuánto tarda en aparecer «sin conexión».
2. **Infección, de 5 a 8 personas**:
   - tarjeta del convertido con la pantalla bloqueada justo después de confirmar;
   - mapa del convertido en los primeros 5 s (V-11);
   - primera captura de un convertido tras 60 s con GPS real;
   - el informe y la cadena de contagio comparados con lo que pasó (V-08);
   - revancha inmediata.
3. **Caza del zorro, de 3 a 4 personas** (prueba de funcionamiento, no de equilibrio; ver el plan, B1, B2 y B8):
   - sorteo y nombre del zorro en la huida (V-09);
   - retraso del directo para el zorro (se esperan 5–10 s);
   - posición y antigüedad de la pista frente a la real;
   - el zorro 40 s fuera de la zona y vuelta;
   - el zorro en un interior (V-01: comprobar `accuracy_too_low` y `target_location_stale`);
   - captura real, con el informe idéntico en todos los móviles;
   - el zorro sale en la cuenta atrás (V-04).
4. **En todos los modos:**
   - vibración y avisos;
   - lectores de pantalla (TalkBack);
   - 360 px reales;
   - batería tras 20 min.

## 4. Riesgos para una partida física
- **V-01, el más importante:** un fugitivo en un portal, en el metro o en un interior queda incapturable y gana por tiempo.
- **V-02:** el cazador puede sondear con «Reclamar».
- **V-05:** quien pulsa «Abandonar» no puede volver a la revancha.
- **V-07:** con Wi-Fi u operador compartido, unos cuantos códigos erróneos bloquean el envío de ubicación con la pantalla bloqueada durante un minuto.
- **El GPS de las simulaciones no tiene ruido.** Los umbrales de captura (5 m más la suma de precisiones, con tope de 40 m) y el «salto» no se han contrastado en partida real.

## 5. Criterio
Ninguna prueba automatizada de este ciclo, incluidas las de 10 bots, sustituye a la validación física. La validación física de cada modo se declarará completada solo con un registro de una partida real (personas, móviles y fecha) y su resultado.
