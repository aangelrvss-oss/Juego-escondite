# Protocolo de sesiones con jugadores (observación de la experiencia)

> **Estado (26/10/2026): borrador, NO ejecutado.** Lo pide la guía de criterio §9 («definir el protocolo antes de cada ronda de pruebas y registrar los resultados de forma consistente»). Sirve para el experimento E1 de `PRODUCT_STRATEGY.md` §8 y para las primeras partidas de HUNT con móviles. **Revísalo y apruébalo antes de usarlo.**

Las pruebas técnicas (`mobile/PRUEBA_PARTIDA_*.md`) responden a si la partida **funciona**. Este protocolo responde a si se **entiende**, es **justa**, es **segura** y la gente **quiere repetir** (guía §2 y §9). Se puede hacer en la misma salida, pero con otra persona observando y tomando notas.

## Antes de la sesión
1. **Participantes:**
   - adultos (D-008) que **no hayan participado en el desarrollo**;
   - de 4 a 10 personas, la cifra que el Plan propone para empezar (§2.2);
   - todos saben que es una prueba y aceptan que se tomen notas, sin nombres.
2. **Lugar y hora:**
   - una zona conocida, de día, sin vías rápidas y con un punto de encuentro claro;
   - la lista de seguridad del anfitrión, revisada en persona.
3. **Qué se prueba en esta ronda:** escríbelo **antes** de empezar. Por ejemplo, la duración (10 o 20 min) y la frecuencia de las pistas. Cada vez, lo menos posible.
4. **Quién observa:** una persona que no juega, con la hoja de registro de abajo.
5. **No fijes objetivos numéricos** en la primera ronda: sirve para tener una línea base (guía §9). Los umbrales de `PRODUCT_STRATEGY.md` §9 son hipótesis, no metas.

## Durante la sesión
- **Explica lo mínimo:** «Esto es un escondite con el móvil. Entrad con el enlace». No expliques las reglas: la app debe hacerlo. Anota cada pregunta que hagan.
- **Observa, no dirijas.** Solo intervienes por seguridad o si el grupo está bloqueado más de 5 minutos (anótalo).
- **Para la sesión** ante cualquier conducta peligrosa: correr por la calzada, agarrar o empujar, o entrar en propiedades. Anota qué regla o mecánica la provocó. Una advertencia no arregla una mecánica peligrosa (guía §7).

## Hoja de registro (una por partida)
| Campo | Qué anotar |
|---|---|
| Partida | Número, hora de inicio y fin, número de jugadores y móviles (modelo, y app o navegador) |
| Reunión → inicio | Minutos desde que el grupo está reunido hasta que empieza la cuenta atrás. Dónde se atascaron |
| Preguntas | Cada pregunta sobre las reglas o la app, con el momento |
| Confusiones de rol | Quién no sabía qué hacer y cuánto tiempo |
| Fallos técnicos | Hora, qué se vio y en qué móvil (conexión, GPS, captura rechazada, pantalla apagada) |
| Capturas | Cuántas por reclamación y cuántas por autodeclaración, cuántas rechazadas o sin respuesta, y si alguna pareció injusta |
| Uso del móvil | Si se mira mientras se corre o se camina (sí, a veces o no) y en qué momentos |
| Seguridad | Cualquier incidente o casi incidente, y su causa |
| Final | Si todos vieron el mismo resultado. Si hubo revancha inmediata (sí o no) |

## Después de cada partida (5 minutos, en grupo o de uno en uno)
1. ¿Cuándo te aburriste o no sabías qué hacer?
2. ¿Qué decisión te pareció interesante?
3. ¿Hubo algo injusto? ¿Una captura, una pista, el GPS?
4. ¿Qué no entendiste?
5. ¿Jugarías otra ronda **ahora**? ¿Organizarías otra partida otro día?

Contrasta las respuestas con lo que hicieron: el entusiasmo verbal por sí solo no demuestra que vayan a repetir (guía §9). La revancha inmediata, o que alguien organice otra partida, pesa más que un «me ha gustado».

## Datos y privacidad
- Notas sin nombres: usa «J1», «J2»… Nada de fotos ni vídeos de personas sin su permiso expreso.
- **No guardes capturas de pantalla del radar ni nada con ubicaciones.** El servidor borra las lecturas al terminar cada partida.
- Las notas se quedan en tu equipo. Si se suben al repositorio, solo un resumen sin datos personales.

## Resultado
Un resumen por sesión: qué se probó, la línea base observada, los problemas por orden de gravedad (primero seguridad, justicia y fallos que impiden terminar) y la decisión que se propone. Va a `QUALITY_STATE.md` y, si cambia algo, a `DECISION_LOG.md` y al backlog (guía §10).
