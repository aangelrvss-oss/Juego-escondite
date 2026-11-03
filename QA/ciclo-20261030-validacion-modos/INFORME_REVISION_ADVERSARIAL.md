# Revisión adversarial · validación de modos (30/10/2026)

El revisor (agente 6) trabajó en dos pasadas y siempre en solo lectura:
1. Una búsqueda propia e independiente, sin ver las conclusiones de los demás.
2. Un intento de refutar los hallazgos de los otros cinco agentes, ya con los resultados de las reproducciones que ejecutó el coordinador.

Textos íntegros:
- `informes-agentes/agente6-informe.md`
- `informes-agentes/agente6-segunda-pasada.md`

## 1. Hallazgos propios y su comprobación
Las reproducciones las ejecutó el coordinador (registro 16).

| ID | Hallazgo | Reproducido | Severidad final |
|---|---|---|---|
| A6-1 | Fugitivo sin GPS: no se le puede capturar, nunca queda «sin conexión» y gana por tiempo | Sí | **P1**, como V-01 |
| A6-2 | «Reclamar» funciona como sondeo de cercanía ilimitado y silencioso | Sí: de 200 m a ≤ 21 m sin que el fugitivo se entere | P2; P1 en el zorro (V-02) |
| A6-3 | Tras «Abandonar» no se puede volver a la revancha | Sí | P2 (V-05) |
| A6-4 | Fantasma en el informe tras una cuenta atrás abortada | Sí | P2 (V-04) |
| A6-5 | Una partida que cruza las 6 h termina sin informe | Sí | P2 (V-06) |
| A6-6 | Fallos ajenos bloquean `/api/loc` | Sí: de `gone` a `rate_limited` durante 59 s | P2 (V-07) |
| A6-7 | Asignaciones invisibles tras un cambio de anfitrión | Sí | P2 (en V-03) |
| A6-8 | Infección: cazadores no exactos tras salidas en la cuenta atrás | Sí | P3, decisión (V-20) |
| A6-9 | Pistas reenviadas a quien queda fuera | Sí | P3 (V-19) |
| A6-10 | Posiciones antiguas en el convertido | Sí | P3 (V-11) |
| A6-11 | La sala de espera no caduca | Sí: 3 h 20 min y sigue en LOBBY | P3 (V-22) |
| A6-12 | «Roles ocultos» se pueden deducir | Sí | P3, documentación (V-23) |
| A6-13 | Ignorar una reclamación no deja rastro | Sí | P3, decisión (V-24) |
| A6-14 | Reloj del servidor no monótono | Sin reproducir (sospecha) | P3 (V-30) |

**Ganchos del simulador:**
- `routes`, `rateNow` y `keepAliveConnected(except)` no cambian el servidor de producción cuando no se usan.
- Hay un matiz: `checkSuspended` usa siempre la hora real. Si el simulador pasa más de 60 s reales en pausa, al reanudar perdona la ausencia de todos.
- Solo afecta a la herramienta, no al juego.

## 2. Hallazgos de otros agentes: veredicto adversarial
No se ha refutado ningún P1 ni P2. Se han matizado varias severidades:

| Hallazgo | Veredicto | Severidad propuesta → final |
|---|---|---|
| A5-1 · el zorro sin nombre en la interfaz | Real, pero solo en la cuenta atrás y la huida; en la persecución se deduce del botón y de la pista. El coordinador lo comprobó con una captura | P1 → **P2** |
| A2-1 · `welcome` perdido | Real, poco frecuente; misma causa que A6-3 | P1 → **P2** |
| A2-2 · comandos pendientes tras perder la sesión | Real pero acotado: el cierre 4000 no lo provoca | P2 → **P3** |
| A3-1, A5-7 · posiciones viejas 5 s | Real; el servidor cumple la regla y lo viejo es la lista del cliente | P2 → **P3** |
| A3-2, A5-6 · tarjeta perdida al reconectar | Real; quedan el chip «CAZADOR» y la franja de la espera | P2 → **P3** |
| A3-3, A5-5 · cadena de contagio incompleta | Real; el informe aprobado sale incompleto | **P2** |
| A4-1 · zorro incapturable | Real. Las variantes A y B son un hueco; C y D vienen de reglas heredadas | **P1** |
| A4-2 · fantasma en el informe | Real | **P2** |
| A4-3, A1-1 · elegir el propio rol | Real; regla §4.3 abierta | **P2**, decisión |
| A4-5 · el anfitrión zorro termina la partida | Conforme a la propuesta §2.2; riesgo de diseño | **P2**, decisión |
| A5-2, A5-3, A5-4 | Reales | **P3** |
| A2-9 · los errores revelan la cercanía | Real; el revisor discrepa del P3 del agente 2 | P3 → **P2** (= V-02) |
| A2-5 · suspensión corta del servidor | No reproducido por el coordinador | Sin confirmar |
| A1-11 · no puede volver a entrar | Corregido: tras volver a la sala sí puede; el problema aparece en la revancha | Integrado en V-05 |
| SIM-INF-04 (escenario del agente 3) | No es un fallo del juego: el escenario teletransporta a los bots en pausa. El caso está cubierto por dos pruebas que pasan | Descartado |

## 3. Riesgos no cubiertos por las pruebas
- Fugitivo sin GPS y sondeo con reclamaciones.
- Revancha tras abandonar.
- Sala de más de 6 h.
- Bloqueo por IP en `/api/loc`.
- Suspensión del servidor y reloj que retrocede.
- Reenvío de eventos a quien queda fuera.
- Cambio de anfitrión con asignaciones hechas.
- Presencia con la cadencia real del cliente: las pruebas del servidor dan señal de vida artificial (`helpers.mjs:30-38`).

## 4. Pruebas débiles detectadas
| Prueba | Debilidad |
|---|---|
| `server/test/helpers.mjs:30-38` | `advance()` da señal de vida a todos cada 20 s, así que no ejerce la presencia real |
| `server/test/presence.test.mjs:176` | El título promete más de lo que comprueba |
| `server/test/presence.test.mjs:137` | Mira la instantánea pero no los eventos reenviados (deja pasar V-19) |
| `sim/panel/test/simulacion.test.mjs:73` | Aserción dentro de un `if` |
| `sim/panel/test/simulacion.test.mjs:43-47` | Acepta cualquier resultado |
| `sim/panel/test/simulacion.test.mjs:127` | Comprueba un detalle interno |
| `mobile/e2e/infeccion.e2e.mjs:174` | Valida una cadena de contagio incompleta |
| `capture-race.test.mjs:29-33`, `presence.test.mjs:114`, `presence.test.mjs:186-188`, `conexion.e2e.mjs:176`, `zorro.e2e.mjs:117` | Esperas fijas que pueden fallar en una máquina lenta |

## 5. Casos que podrían romper una partida real
1. **Sin GPS pero con datos:** un fugitivo entra en un portal o en el metro y queda intocable (V-01).
2. **Revancha tras abandonar:** alguien pulsa «Abandonar» y no puede entrar en la revancha (V-05).
3. **IP compartida:** con la misma Wi-Fi u operador, unos códigos mal escritos bloquean el envío con la pantalla bloqueada durante un minuto (V-07).
4. **Tarde larga con la misma sala:** la partida que cruza las 6 h termina sin informe (V-06).
5. **Detector «caliente o frío»:** un cazador que pulsa nombres sin parar sabe si alguien está cerca (V-02).

## 6. Recomendación para la validación física
- **Clásico:** listo para una prueba con un grupo de confianza, con tres avisos:
  - la captura depende de la honradez (V-01, V-02);
  - quien quiera revancha no debe pulsar «Abandonar» (V-05);
  - no conviene pasar de unas 5 h 30 min con la misma sala (V-06).
  - Además, arrancar el servidor con el script oficial (`TRUST_PROXY=1`, `STATE_FILE`).
- **Infección:** lista, con los mismos avisos. Si se va a evaluar el informe, antes conviene arreglar V-08, V-11, V-12 y V-13, que son baratos.
- **Caza del zorro:** sirve como prueba de funcionamiento, no de equilibrio, hasta que el propietario decida B1, B2 y B8. Antes conviene corregir V-09 (nombrar al zorro) y V-04. En la prueba, el zorro se compromete a mantener el GPS activo.

## 7. Fase 6 (después de las correcciones)
Pendiente: no se ha aplicado ninguna corrección. Cuando se apliquen, un agente que no las haya escrito ejecutará de nuevo los scripts de `reproducciones/` y buscará efectos secundarios, sin dar nada por resuelto porque exista una prueba nueva.
