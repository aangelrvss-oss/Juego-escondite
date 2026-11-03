# Auditoría de experiencia de usuario

Base: la partida grabada (vídeo de 3:05, perspectiva de la **cazadora** Ana, 4 jugadores), las capturas de las E2E (perspectiva de la **fugitiva** Caro) y la lectura del código de las pantallas.

**Límites:**
- **Mapa de prueba con calles sintéticas.** Las calles reales no se han visto.
- **Navegador emulado, no un móvil:** ni sol, ni carrera, ni una sola mano reales.
- **Tiempo del servidor acelerado** en algunos tramos (por eso algunas antigüedades parecen altas).
- **Nadie que juegue por primera vez lo ha probado.** Esta evaluación es una inspección experta, no un test con usuarios.

## Respuestas directas

| Pregunta | Respuesta | Evidencia |
|---|---|---|
| ¿Se entiende qué es el juego sin explicaciones? | **A medias.** El inicio dice «Escondite urbano con GPS real». Las reglas están, pero en una tarjeta larga al final de la sala, que hay que desplazar | `partida-grabada/01`, `/03` |
| ¿Se entiende qué debe hacer cada uno? | **Sí:** una frase por fase y rol («Espera en la zona de salida…», «¡Huye! Escóndete…», «Caza a los fugitivos. Usa las pistas.») | `/09`, `e2e-mapa/2` |
| ¿Está claro quién persigue y quién huye? | **Sí:** tarjeta del rol a pantalla completa y etiqueta CAZADOR (naranja) o FUGITIVO (cian) siempre visible | `/07`, `/10` |
| ¿Se entienden los elementos del mapa? | **No del todo:** no hay leyenda; «pista = marcador hueco y discontinuo» y «encuentro = cuadrado» no son evidentes | `/13` |
| ¿Las acciones principales son fáciles de encontrar? | **No en la persecución:** «¿Has pillado a alguien?» queda debajo del mapa y hay que desplazarse | `/15`, `/18` |
| ¿Las notificaciones son visibles? | **Demasiado:** los avisos flotantes tapan el reloj, el rol y el título del resultado | `/13`, `/18`, `/19` |
| ¿Los temporizadores se leen bien? | **Sí:** reloj grande con el nombre de la fase; la reclamación tiene su propia cuenta atrás (0:30) | `/10`, `e2e-mapa/5` |
| ¿Hay demasiada información? | **En la sala, sí** (código, jugadores, configuración, aviso nocturno y reglas en una sola columna). **En la partida, no** | `/03`, `/04` |
| ¿Hay jerarquía visual clara? | **Sí** en la partida y el resultado; la sala es larga y plana | — |
| ¿Explica qué pasa sin cobertura? | **Sí:** «Sin conexión con el servidor. La partida sigue…» arriba y «posiciones congeladas» en el mapa; desaparece al reconectar | `/11`, `/12` |
| ¿El flujo es intuitivo? | **Sí, en orden lineal:** sala → listo → cuenta atrás → rol → huida → persecución → pista → captura → Mission Report → revancha | Vídeo completo |
| ¿Errores, solapes o estados confusos? | **Sí, menores:** etiquetas del mapa solapadas en el centro y cortadas en el borde; dos avisos seguidos al capturar | `/09`, `/13`, `/18` |

## Dónde se puede confundir, aburrir o abandonar un jugador

1. **Cazador, durante la huida (2 min):** solo puede esperar y ve un mapa casi vacío. Primer momento de aburrimiento.
2. **Fugitivo, durante toda la persecución:** nunca ve a los cazadores (es la regla). Solo sabe que hubo una pista. Un mapa con su propio punto y sus compañeros, sin información nueva durante minutos, puede hacerse largo.
3. **Cazador, entre pistas (2–15 min según la configuración):** sin información nueva. En el vídeo, los tramos de aproximación duran unos 45 s y unos 40 s sin nada que mirar.
4. **Al reclamar:** el cazador tiene que desplazarse, elegir un nombre y esperar a que el fugitivo confirme. Si el fugitivo dice «No» o no contesta en 30 s, no hay captura. **Sin regla de disputas** (D-035), esto puede acabar en discusión.
5. **Fugitivo:** el gran botón rojo «Me han pillado» está siempre visible. Pulsarlo por error abre una hoja que se puede cancelar, pero en carrera confunde.
6. **Primer uso:** la clave del flujo («la pista es una foto antigua») se pierde si nadie lee el aviso.
7. **Coordinación:** no hay radio ni chat (D-006 / D-043). Sin un canal externo acordado, un equipo no se puede coordinar.

## Problemas por prioridad

| Id | P | Problema | Evidencia | Consecuencia | Propuesta (no implementada) |
|---|---|---|---|---|---|
| UX-01 | **P1** | La acción de captura y la lista de pistas quedan debajo del mapa a 360×740 | `/15`, `/18` | En carrera hay que desplazarse para capturar; se pierde el momento o se mira demasiado la pantalla | Barra inferior fija en la persecución con la acción de cada rol, o un mapa más bajo con la acción debajo. Probar en un móvil antes de decidir |
| UX-02 | **P1** | La captura depende de que el fugitivo confirme; sin regla de disputas | Código `engine.ts` `claimTag`/`respond_tag`; `e2e-mapa/5` | Un fugitivo que pulsa «No» nunca es capturado por reclamación: conflicto social | Decidir D-035 (regla por defecto y resolución) antes de jugar con desconocidos |
| UX-03 | P2 | Los avisos flotantes tapan el reloj, el rol y el título del resultado; se apilan hasta 3 (p. ej., «Dani ha entrado», «Eva ha entrado» y «¡Empieza la persecución!» al empezar la persecución) y tapan casi todo el mapa | `/13`, `/18`, `/19`, `e2e-partida-5-navegadores/05-reclamacion-Ana.png` | Se pierde la información principal unos 4,5 s, justo en los momentos clave | Que los avisos aparezcan sin tapar la tarjeta del reloj, o que sean más cortos |
| UX-04 | P2 | Etiquetas del mapa solapadas («Encuentro», tu marcador y el compañero en el mismo punto) y cortadas en el borde | `/09`, `/11`, `/13` | Nombres ilegibles justo al empezar | Ocultar «Encuentro» bajo tu marcador; etiquetas más cortas («Bruno · 10 s») |
| UX-05 | P2 | Sin leyenda de marcadores | `/13` | La pista se confunde con una posición actual | Leyenda mínima plegable dentro del mapa |
| UX-06 | P2 | El encuadre de toda la zona hace que la aproximación final apenas se vea | `/16` | Al acercarse a 10 m, no se aprecia la distancia | Modo «seguirme» opcional junto a «Mi posición» |
| UX-07 | P2 | Momentos muertos (cazador en la huida, todos entre pistas) | Vídeo 0:33–0:50 y 1:24–2:09 | Aburrimiento y abandono | Decisión de diseño (frecuencia de pistas, D-047); no se cambia sin decidir |
| UX-08 | P2 | Sala de espera larga en una sola columna | `/03`, `/04` | El anfitrión desplaza mucho; las reglas apenas se leen | Agrupar reglas y configuración en pestañas o en una hoja plegable |
| UX-09 | P3 | Dos avisos redundantes al capturar («Captura confirmada» + «Carla capturado») y sin concordancia de género | `/18` | Ruido | Un solo aviso con un texto neutro («Carla, capturada» o «Captura: Carla») |
| UX-10 | P3 | «Sin conexión» por duplicado (arriba y en el mapa) | `/11` | Ruido leve | Aceptable; revisar con usuarios |
| UX-11 | P3 | «Me han pillado» siempre visible y muy destacado para el fugitivo | `e2e-mapa/5` | Pulsación accidental (se puede cancelar) | Hacerlo menos prominente o con confirmación |

**Corregidos en la sesión anterior** (ya en el código evaluado):
- desbordamiento horizontal de la sala a 360 px, que ya existía;
- «PERSECUCIÓN» fuera de su recuadro;
- atribución del mapa plegada;
- 404 de configuración en la consola.

## Lo que esta auditoría no ha evaluado

- **Nadie que juegue por primera vez** lo ha probado: el protocolo de sesiones está en `docs/product/PROTOCOLO_SESIONES_JUGADORES.md`, en borrador.
- **El espectador** (jugador capturado con 60 s de retraso): no se ha grabado ni capturado.
- **Accesibilidad:** contraste y lectores de pantalla, sin revisar.
