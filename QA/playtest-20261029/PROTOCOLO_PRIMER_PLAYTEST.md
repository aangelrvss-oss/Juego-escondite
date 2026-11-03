# THE OUTRUN · Protocolo del primer playtest con amigos

> Preparado el 29/10/2026 a partir de la propuesta del agente de diseño del playtest. No añade mecánicas: usa las reglas y opciones actuales. Complementa a `QA/CHECKLIST_PRUEBA_FISICA.md` (F-01…F-25), no la sustituye.

## 1. Objetivo de la sesión

1. **Técnico:** cerrar lo pendiente con GPS real y varios jugadores:
   - partida completa;
   - captura con toque real (F-14/F-16);
   - corte y vuelta de la red con modo avión (F-17/F-18);
   - todos ven el mismo Mission Report (F-21).
2. **Comprensión:** ver si se entiende sin ayuda:
   - la pista y su cuenta atrás;
   - el aviso al fugitivo («Pista en 1 min» y «Los cazadores acaban de recibir tu posición»);
   - la captura;
   - la pantalla de resultados.
3. **Línea base, sin objetivos numéricos:**
   - cuánto se tarda en empezar;
   - cuántas reclamaciones se rechazan (D-035);
   - en qué momentos se aburre la gente (D-047).

No es una demostración de que el juego sea divertido: es una sesión para aprender.

## 2. Jugadores y reparto

- **5–6 jugadores y 1 observador que no juega** (el organizador, con el portátil).
- Con «Sorteo», el motor asigna `ceil(n/4)` cazadores: **5 jugadores → 2 cazadores y 3 fugitivos; 6 → 2 y 4**. Con 4 saldría 1 contra 3, demasiado desigual para una primera vez.
- **Revancha** (actualizado el 29/10/2026): cada revancha hace un **sorteo nuevo** de roles al empezar. Es un sorteo, así que alguien puede repetir rol. Si queréis garantizar que todos prueben los dos, el anfitrión puede asignar a mano en la sala.
- **Al terminar**, el resumen muestra los equipos de todos (durante la partida siguen ocultos).
- Al menos un Android con Chrome. Si hay un iPhone, mejor: Safari no se ha probado nunca.

## 3. Configuración recomendada (opciones existentes)

| Parámetro | Partidas 1 y 2 | Partida 3 (cambia una sola cosa) |
|---|---|---|
| Radio | **300 m** | 300 m |
| Huida | **3 min** | 3 min |
| Persecución | **15 min** | 15 min |
| Pistas cada | **2 min** | **3 min** (para comparar el aburrimiento, D-047) |

**Por qué estos valores:**
- **300 m:** la zona se cruza andando en unos 4 min, así que la pista sirve antes de quedar vieja y nadie camina sin propósito.
- **Pistas cada 2 min:** hay 7 pistas por partida, y la primera llega a los 2 min de empezar la persecución.

Los valores por defecto de la app (20 min, 2 min, cada 3 min, 400 m) **no** son los recomendados: el anfitrión tiene que cambiarlos.

## 4. Duración orientativa (unas 2 h 15 min)

| Bloque | Min |
|---|---|
| Comprobaciones en el portátil (antes de salir) | 20 |
| Reunión, entrada en la sala, permisos y briefing | 15 |
| Partida 1 (cuenta atrás, 3 + 15 min, resultados) | 22 |
| Preguntas rápidas | 5 |
| Partida 2 (roles cambiados y prueba de modo avión) | 22 |
| Preguntas rápidas | 5 |
| Partida 3 (pistas cada 3 min) | 22 |
| Preguntas finales y cierre del túnel y del servidor | 20 |

## 5. Comprobaciones previas

**Portátil** (se queda conectado a Internet):
- [ ] Enchufado y sin suspensión.
- [ ] `.\server\iniciar-servidor.ps1 -SoloComprobar` termina en «Todo correcto».
- [ ] Servidor arrancado (ventana 1) y túnel abierto (ventana 2). Dirección `https://….trycloudflare.com` copiada.
- [ ] **Añadir esa dirección exacta a los orígenes permitidos de la clave de MapTiler.** Hoy solo está validado `http://127.0.0.1:8787`.
  - Si el túnel se reinicia, la dirección cambia y hay que añadirla otra vez.
  - Sin este paso el juego funciona igual, pero con el **radar** en lugar del mapa.
- [ ] Desde un móvil con datos (sin wifi):
  - `/health` responde `{"ok":true…}`;
  - en una sala de prueba, al llegar a la huida, se ven calles y «© MapTiler © OpenStreetMap contributors».
- [ ] La clave no aparece en capturas, en el chat ni en la pantalla compartida.

**Cada jugador:**
- [ ] Batería ≥ 70 % (mejor con batería externa) y datos móviles activos.
- [ ] Ahorro de batería desactivado y bloqueo automático de la pantalla al máximo.
- [ ] Permiso de ubicación concedido. «Estoy listo» con «GPS ±N m», con N ≤ 30, antes de empezar.
- [ ] Llamada de grupo o chat externo creado (la app no tiene chat ni radio).
- [ ] **Tocar la pantalla una vez al entrar en la partida.** Tras recargar la página, el navegador no deja vibrar hasta el primer toque.

## 6. Protocolo de seguridad

- **Lugar:** de día, en una zona peatonal conocida (parque o plaza), sin calzadas ni vías dentro del círculo. Punto de encuentro acordado.
- **Edad:** todos mayores de 18, y lo confirman en la app.
- **Prohibido:**
  - correr por la calzada o cruzar fuera de los pasos;
  - saltar vallas;
  - entrar en propiedades o edificios abandonados;
  - agarrar o empujar. La captura es un **toque suave**.
- **El móvil no se mira en movimiento:** primero paras, luego miras o pulsas.
- **Palabra de parada «¡STOP!»** por la llamada de grupo: todos quietos. El anfitrión puede terminar la partida.
- **Abandonar:** cualquiera puede hacerlo cuando quiera.
- **El observador** para la sesión si ve una conducta peligrosa y anota qué la provocó.
- **Privacidad:** no se comparte la dirección del túnel fuera del grupo, ni capturas con lugares reconocibles.

## 7. Briefing (2 minutos)

> «Esto es un escondite con el móvil, y es una prueba: si algo falla, lo apuntamos y seguimos.
> Tras una cuenta atrás de 5 s, cada uno ve **solo su rol**. Los fugitivos tienen **3 min de huida**; los cazadores esperan aquí. Después vienen **15 min de persecución**.
> **Cazadores:** debajo del reloj veis **cuánto falta para la próxima pista**. Cuando llega, veis en el mapa (y en la tarjeta «Pista nº…», justo debajo) **dónde estaba** cada fugitivo, con su antigüedad. Es dónde estaba, no dónde está.
> **Fugitivos:** debajo del reloj veis **cuándo recibirán los cazadores vuestra posición**. Un minuto antes os avisa («Pista en 1 min») y, cuando la reciben, el móvil vibra y sale una franja roja. Si pasáis más de 30 s fuera del círculo, os ven en directo.
> **Captura:** toque suave. Ya parado, el cazador pulsa el nombre del fugitivo abajo. Al fugitivo le sale «¿Te ha pillado…?» con 30 s: si fue un toque real, pulsad **Sí**. Sin vuestra confirmación no cuenta. Si el GPS no deja, el fugitivo puede pulsar «Me han pillado».
> **Pantalla siempre encendida** y la app abierta: con la pantalla apagada no se envía vuestra posición. El GPS tiene que dar ±30 m o mejor para capturar.
> Nada de calzadas ni carreras mirando el móvil. «STOP» por la llamada lo para todo. Al final, comparamos la pantalla de resultados.»

## 8. Qué observar

| Riesgo | Qué mirar |
|---|---|
| **Pista** | ¿El cazador entiende que el punto hueco es una posición pasada? ¿Mira la cuenta atrás de la próxima pista? ¿Espera la pista o se mueve? ¿Encuentra la tarjeta «Pista nº…»? |
| **Temporizadores** | ¿Saben en qué fase están y cuánto queda? ¿Los relojes de varios móviles coinciden (±1 s)? ¿Algún cazador sale antes de tiempo? |
| **Aviso al fugitivo** | ¿Notan la vibración y la franja roja? ¿Reaccionan a «Pista en 1 min» moviéndose? ¿Les resulta útil o estresante? |
| **Captura** | Intentos hasta validar y mensaje exacto de cada rechazo. Uso de «Me han pillado». ¿Alguna captura pareció injusta? ¿Alguien no vio la reclamación a tiempo? |
| **GPS y pantalla** | «Lectura antigua», «Sin señal», pantallas que se apagan solas, modelos que muestran «Mantén la pantalla encendida». |
| **Reconexión** (partida 2) | Un fugitivo **parado y en un lugar seguro** pone el modo avión 60 s. Anotad cuánto tarda en salir «Sin conexión…» (puede tardar hasta unos 40 s o no salir: no es un fallo) y cuánto en volver «GPS ±N m». Si no se renueva en 1 min, anotad la hora. |
| **Zona** | Salidas del círculo: ¿intencionadas? ¿Entendieron que les hace visibles? |
| **Resultados** | ¿Todos ven el mismo Mission Report? ¿Se entiende quién ganó y por qué? ¿Leen «Tu partida»? ¿Echan algo en falta? ¿Pulsan «Revancha» o «Compartir» sin que se lo pidan? |
| **Seguridad** | Carreras, cruces o uso del móvil en movimiento, y en qué momento del juego. |

## 9. Registro de incidencias

Una fila por incidencia. Los jugadores se anotan como J1, J2… por orden de entrada. Quién es quién se apunta aparte, en papel.

| Hora | Jugador | Rol | Fase (sala / cuenta / huida / persecución / resultados) | Qué pasó (texto exacto del mensaje) | Captura de pantalla (sí/no, archivo) | Móvil y navegador |
|---|---|---|---|---|---|---|
| | | | | | | |

Las capturas de pantalla van **sin mapa con lugares reconocibles**: recortadas, o solo del mensaje. Al terminar se adjunta el informe de diagnóstico (`%USERPROFILE%\OutrunDiagnostico\diagnostico-….md`).

## 10. Preguntas para después

1. ¿En qué momento no sabías qué hacer o te aburriste?
2. Cazadores: ¿qué entendíais que mostraba la pista? ¿Mirabais cuánto faltaba para la siguiente? ¿Os sirvió para decidir hacia dónde ir?
3. Fugitivos: ¿os enterasteis de cuándo os enviaban a los cazadores? ¿El aviso de 1 minuto os hizo cambiar de sitio?
4. ¿Las pistas cada 2 min (o cada 3, en la partida 3) os parecieron pocas, bien o demasiadas?
5. ¿Sabíais siempre cuánto tiempo quedaba y en qué fase estabais?
6. ¿Alguna captura os pareció injusta, o alguna no se pudo validar cuando debía?
7. En la pantalla de resultados, ¿se entendía al primer vistazo quién ganó y por qué? ¿Os sirvió ver los equipos de todos y quién siguió libre? ¿Qué echasteis en falta? ¿Sobraba algo?
8. ¿Os resultó incómodo llevar la pantalla encendida? ¿Cuánta batería gastasteis?
9. ¿Hubo algún momento en que os sintierais inseguros o con prisa por mirar el móvil?
10. ¿Jugaríais otra ahora mismo?
