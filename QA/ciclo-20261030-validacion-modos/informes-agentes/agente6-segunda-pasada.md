# Agente 6 · Segunda pasada: contraste de los P1/P2 ajenos (solo lectura)

Base: los informes de los agentes 1 a 5, los registros 10-21 del coordinador y una nueva lectura del código. No he ejecutado nada.

## 1. Veredictos

**Leyenda:**
- **Sev.:** severidad final propuesta.
- **Prop.:** ¿hace falta una decisión del propietario?

| ID | Veredicto | Sev. | Prop. | Nota |
|---|---|---|---|---|
| A2-1 | Real (reproducido) | P2 | No | Rara: el `welcome` se pierde justo tras el `join`. El fantasma bloquea `start` y, si el anfitrión lo expulsa, la persona queda vetada (`blockedDevices`). Salida: otro navegador. Misma raíz que A6-3: la deduplicación por `deviceId` (`engine.ts:756`) y el veto al expulsar. Solución sin tocar reglas: `join`/`create` idempotentes por `installId`, o devolver la sesión del fantasma desconectado. |
| A2-2 | Real, pero acotado | P3 | No | La vía del cierre 4000 **no** falla: `connect()` crea otra conexión y `close()` resuelve los pendientes (`app.js:174-175`, `net.js:448`). Tampoco «Salir» con cobertura: el `result` llega tras `removed`. Solo queda `bad_session`/`kicked` con comandos enviados sin conexión. Pasa poco y se recupera creando otra sala. |
| A3-1 / A5-7 | Real (= A6-10, A4-8 para quien sale) | P3 | No | No revela nada nuevo: son posiciones que el convertido ya veía un segundo antes. Es un fallo de etiqueta durante 5 s como mucho. El servidor sí cumple «al instante» (`visiblePositions`). |
| A3-2 / A5-6 | Real | P3 | No | Queda el chip «CAZADOR», la leyenda de cazador y la franja «Acabas de convertirte…» durante 60 s (`app.js:952-955`). Solo falta la tarjeta. Basta con quitar `role_changed` de `isStaleEvent` o deducirla de `captures`. |
| A3-3 / A5-5 | Real | P2 | Producto (formato), no regla | `contagionChains` sigue solo a la primera víctima (`game-view.js:253`). El informe aprobado (D-057 §2) sale incompleto; la cronología sí está completa. La e2e `infeccion.e2e.mjs:174` fija la salida incompleta. Hay que elegir entre árbol y una línea por infectador. |
| A4-1 (= A6-1, A1-3; variante C = A1-4 y A6-13) | Real (reproducido: A, B, C y D) | **P1** (P0 si el zorro es un desconocido) | **Sí** | Las variantes A y B son un hueco: la presencia no exige GPS. C y D son reglas heredadas: confirmación obligatoria, D-035 pendiente y «el final va antes». Cualquier solución cambia o interpreta una regla: exponer o retirar al fugitivo sin lectura, contar como rechazo la no respuesta, ventana de disputa al final. |
| A4-2 (= A6-4, A1-11) | Real (reproducido) | P2 | No | En la Caza del zorro el informe muestra **dos «Zorro»**. Corrijo A1-11: tras la vuelta a la sala, quien salió **sí** puede volver a entrar (`join` excluye a los `left`, `engine.ts:756`). El bloqueo `already_joined` aparece en la revancha, cuando el fantasma pasa a `invited` (A6-3). Arreglo: en `backToLobby`, también limpiar `team` y `playedGameNo` y marcar `leftRoom` en quien salió. |
| A4-3 / A1-1 | Real | P2 (P3 en Clásico, donde es heredado de S0) | Sí (ligera) | Exige un cliente modificado, porque la interfaz no envía `set_team_pref`. §4.3 deja abierta la PREGUNTA «¿se respetan las preferencias?», y §11.3 dice «por sorteo o asignado por el anfitrión». Más vías de preferencias invisibles: A6-7 (traspaso de anfitrión) y A1-2 (`swapRoles`). Con el anfitrión que se va basta para bloquear el inicio sin trampa. |
| A4-5 | Conforme a §2.2 (propuesta de S0: «el anfitrión termina → sin ganador») | P3 como defecto; riesgo P2 en el Zorro | **Sí** | No es un fallo de código. Pide doble toque en la interfaz. Igual que abandonar con una reclamación pendiente (D6). |
| A5-1 | Real (confirmado por el coordinador), pero matizado | P2 | No | En la persecución el cazador sí puede saberlo: la única ficha de reclamar es el zorro (`rivals`, `app.js:957`) y la pista lleva su nombre (`app.js:983`). En la calle, además, se ve quién sale corriendo. Falla durante la huida y nunca se nombra de forma explícita. |
| A5-2 | Real | P3 | No | Se cierra al tocar y dura como mucho 15 s. Solo afecta al último infectado. |
| A5-3 | Real | P3 | No | La regla (volver a la sala) sí se cumple; falta el aviso. La sala muestra otra vez «Estoy listo». |
| A5-4 | Real | P3 | No | El informe común es correcto («Sin conexión»). El texto personal «Tu equipo gana · Seguías libre al final» contradice D-057 («como si abandonara»). Afecta solo a quien vuelve tras quedar fuera por tiempo, porque quien abandona olvida la sesión. |

**Otros P1/P2 que conviene fijar:**

| ID | Veredicto | Sev. | Prop. | Nota |
|---|---|---|---|---|
| A6-2 / A2-9 | Real (reproducido) | P2 (P1 en el Zorro) | **Sí** | El agente 2 lo deja en P3 porque «no da la distancia». El acierto, en cambio, sí da «está a ≤ 21-40 m», y el fallo no avisa a nadie. Limitarlo (más espera entre reclamaciones, un error genérico, avisar al fugitivo) toca la mecánica de captura y §8.1. |
| A6-3 | Real (reproducido) | P2 | No | Quien abandona no puede volver a la revancha. Es la misma raíz que A2-1 y A4-2. |
| A6-5 | Real (reproducido) | P2 | No (técnico) | Una partida que cruza las 6 h termina en CANCELLED: no hay informe ni revancha. Impedir `start` si la partida no cabe, o comprobar la vida máxima solo en LOBBY. |
| A6-6 | Real (reproducido: `antes: gone` era la línea base esperada; `después: rate_limited`) | P2 | No | El agente 2 lo da como «conocido», pero solo en el túnel sin `TRUST_PROXY=1`. Con `TRUST_PROXY=1` sigue pasando con la misma Wi-Fi o la misma CGNAT. Solución: comprobar la sesión antes del contador de fallos. |
| A1-3 / A1-4 | Riesgo de regla (= A4-1) | P2 | **Sí** | No es un defecto de código: es conforme a la letra de D-057 y de §11.1. |

**Rebajas propuestas:**
- **A2-5:** no se reprodujo; queda en P3, sin probar.
- **A3-1, A3-2, A5-2, A5-3, A5-4 y A5-6:** son de interfaz, sin efecto en el estado ni en las reglas, así que propongo P3.

## 2. Duplicados entre agentes

- **Fugitivo o zorro incapturable:** A4-1 = A6-1 = A1-3. La no respuesta: A4-1C = A1-4 = A6-13.
- **Sondeo con `claim_tag`:** A6-2 = A2-9.
- **Fantasma de la cuenta atrás:** A4-2 = A6-4 = A1-11.
- **Misma raíz (`deviceId` y veto al expulsar):** A6-3 ≈ A2-1.
- **Preferencias de equipo invisibles:** A4-3 = A1-1. Con la misma raíz: A1-2 (`swapRoles`) y A6-7 (traspaso de anfitrión).
- **Infección «exactos» en la cuenta atrás:** A6-8 = A3-7 = A1-9.
- **Pistas reenviadas al expulsado:** A6-9 = A4-7.
- **Posiciones antiguas en el mapa (convertido / quien sale):** A6-10 = A3-1 = A5-7, y A4-8.
- **Tarjeta de conversión perdida:** A3-2 = A5-6. Tarjeta fija «1 min» / 15 s: A3-4 = A5-9.
- **Cadena de contagio:** A3-3 = A5-5.
- **`canTagFrom` tras el final:** A3-5 = A1-7.
- **Autodeclaración atribuida sin cercanía:** A4-6 = A1-10. Descartada en silencio con un convertido en espera: A3-10 = A5-10.
- **Nombres de eventos y errores frente a §3.4 / AC-I:** A3-6 = A1-6.
- **Roles deducibles por complemento / `hunterId` público:** A6-12 = A2-10.
- **Reloj de pared:** A6-14 = A2-7.
- **Textos del informe en el Zorro y en Infección:** A4-9 ≈ A5-12.

## 3. Necesitan decisión del propietario (arreglarlos cambia o interpreta una regla aprobada)

1. **Fugitivo sin lectura válida, sobre todo el zorro** (A4-1, A6-1, A1-3; D4): exponerlo, retirarlo, avisar, o dejar la autodeclaración honrada como única vía.
2. **Reclamación sin respuesta o disputada** (A1-4, A6-13; D-035 y §9.3) y **reclamación válida pendiente al llegar el final** (A4-1D; D3).
3. **Límite del sondeo con reclamaciones** (A6-2 / A2-9), frente a §8.1.
4. **¿Puede el jugador elegir su propio rol?** (A4-3 / A1-1; §4.3 PREGUNTA, §11.3 «sorteo o anfitrión»).
5. **El anfitrión termina sin ganador; abandonar para evitar la derrota** (A4-5, D6, D7; §2.2 propuesta).
6. **«Exactos» de Infección solo al empezar** (A6-8, A3-7, A1-9).
7. **Caza del zorro:**
   - 1 contra 1 tras abandonos (D1);
   - todos los cazadores fuera → ¿gana el zorro? (D2);
   - ¿un cazador «sin conexión» sigue siendo «activo» para el directo del zorro? (A4-4, D5).
8. **Formato de la cadena de contagio** (A3-3 / A5-5): es de producto, no de regla.

No necesitan decisión: A2-1, A2-2, A6-3, A4-2, A6-5, A6-6, A5-1 y todos los P3 de interfaz.

## 4. Recomendación final por modo para la validación física

- **Clásico:** lista para la validación física con un grupo de confianza.
  - No hay ningún fallo que corrompa la partida ni que cambie un resultado legítimo; los escenarios 20-21 terminan sin fugas, con un único final y con revancha.
  - Antes de salir:
    - avisar de que la captura depende de la honradez (A4-1, A6-2);
    - no usar «Abandonar» si se quiere jugar la revancha (A6-3);
    - no encadenar partidas pasadas las 5 h 30 min con la misma sala (A6-5);
    - arrancar con el script oficial (`TRUST_PROXY=1`, `STATE_FILE`).
- **Infección:** lista para la validación física con las mismas advertencias. El núcleo es correcto: conversión atómica, espera de 60 s y pista anterior.
  - Arreglos baratos recomendados antes, porque se notan en la calle:
    - limpiar `ui.positions` y la tarjeta (A3-1, A5-2);
    - la tarjeta tras reconectar (A3-2);
    - la cadena de contagio (A3-3), si el informe se va a evaluar.
- **Caza del zorro:** apta solo para probar el **funcionamiento** (roles, directo, pistas, final). No sirve para sacar conclusiones de equilibrio hasta que el propietario decida los puntos 1 a 3 y 7.
  - Recomiendo arreglar antes A5-1 (nombrar al zorro) y A4-2 (fantasma «Zorro» en el informe).
  - En la prueba, el zorro tiene que mantener el GPS activo, por compromiso explícito del grupo.
