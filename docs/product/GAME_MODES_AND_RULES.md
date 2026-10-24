# Modos de juego y reglas

**Versión:** 1.0 · 24/10/2026 (sesión 4: cierre de diseño)
**Propósito:** fuente única de las reglas de juego. Los demás documentos remiten aquí.

**Leyenda de estado**

| Marca | Significado |
|---|---|
| **[PROPIETARIO]** | Regla definida por el propietario (sesión 4). No se cambia sin su aprobación |
| **[PROPUESTA]** | Propuesta técnica o de diseño de Claude. **No está aprobada** |
| **[PARÁMETRO]** | Valor por decidir. Si aparece un valor, es solo una propuesta inicial |
| **[DISPOSITIVO]** | Solo se puede validar con dispositivos reales (S1–S3) |

**Alcance:** qué parte de este documento entra en el MVP está **pendiente de aprobación** (D-030). Este documento especifica, pero no autoriza a implementar. El motor de S0 solo implementa el modo Clásico con zona fija.

---

## 1. Principios comunes a todos los modos

1. El servidor es la única autoridad sobre el estado, los temporizadores, los equipos, las capturas, la zona y el resultado (`docs/technical/GAME_STATE_MACHINE.md`).
2. Las reglas y los parámetros se **congelan al empezar** cada ronda. Un cambio solo afecta a la ronda siguiente.
3. Ninguna regla puede incentivar correr por la calzada, entrar en propiedades privadas ni acercarse peligrosamente a otras personas. La app **no puede garantizar** la seguridad física.
4. Se comparte el mínimo de información de ubicación, solo con quien la necesita según las reglas, y se borra al terminar.

---

## 2. Modo Clásico

### 2.1 Reglas [PROPIETARIO]
- Los **equipos permanecen fijos** durante toda la partida.
- Los **fugitivos ganan** si queda al menos uno sin capturar cuando termina el tiempo.
- Los **cazadores ganan** si capturan a todos los fugitivos antes del final.
- La partida **puede** usar zona dinámica (§6) y pistas (§7) según las reglas que se definan.

**Consecuencia:** en Clásico, un fugitivo capturado **no** se une a los cazadores. Queda como espectador con retraso. Esto confirma para Clásico la propuesta [P] de `PRODUCT_STRATEGY.md` §5.

### 2.2 Casos no cubiertos por las reglas del propietario [PROPUESTA, de S0 (D-023)]
| Caso | Propuesta |
|---|---|
| El último fugitivo activo **abandona** (no es capturado) | Sin ganador: "Los fugitivos abandonaron" |
| Todos los cazadores abandonan | Sin ganador: "Los cazadores abandonaron" |
| El anfitrión termina la partida | Sin ganador |

---

## 3. Modo Infección

### 3.1 Reglas [PROPIETARIO]
- La partida empieza con **uno o varios cazadores**, y el resto son fugitivos.
- Cada **captura confirmada** convierte al fugitivo capturado en **cazador** durante esa misma partida.
- La partida termina cuando **todos son cazadores** o cuando **se agota el tiempo**.
- Si se agota el tiempo con fugitivos libres, **ganan los supervivientes**.
- La **duración de la transición** y la **ventaja inicial** son parámetros por definir (§3.5).

### 3.2 Transición de equipo [PROPUESTA]
Ocurre en **un único paso atómico** del servidor, al confirmarse la captura:

1. Se comprueba que el fugitivo sigue en `team = runner` y `status = active`. Si no, no pasa nada: es idempotente (§3.4).
2. Se registra la captura: `captureId`, cazador, fugitivo y minuto. Sin coordenadas.
3. Se borran las muestras de ubicación que tenía como fugitivo (minimización).
4. Cambia a `team = hunter`, se marcan `convertedAt` e `infectedBy`, y `canTagFrom = convertedAt + T_transición`.
5. Se emiten:
   - A todos: `runner_infected { playerId, hunterId, captureId, atOffsetMs }`.
   - Solo al convertido: `role_changed { team: 'hunter', canTagFrom }`.
6. Se comprueba el final: si no queda ningún fugitivo activo, la partida termina (§3.6).

### 3.3 Cambio de permisos del convertido [PROPUESTA]

| Permiso | Antes (fugitivo) | Después (cazador) | Cuándo cambia |
|---|---|---|---|
| Ver en directo a los fugitivos compañeros | Sí | **No** | Al instante, en el mismo paso |
| Ser visto por los demás fugitivos | Sí (como compañero) | **No** (los fugitivos nunca ven cazadores) | Al instante |
| Ver en directo a los cazadores | No | Sí | [PARÁMETRO] al instante o tras `T_transición` |
| Recibir pistas | No | Sí | [PARÁMETRO] desde la **siguiente** pista (propuesta: **no** recibe la última ya emitida) |
| Declarar capturas | No | Sí | Tras `T_transición` |
| Compartir su ubicación | Sí (con fugitivos) | Sí (con cazadores) | Sigue enviando. Cambia el destinatario |
| Usar el escáner (§8) | No | [PARÁMETRO] | Con su propio cupo o sin él |

**Por qué existe la transición:** el convertido conocía hasta ese instante la posición en directo de los demás fugitivos. `T_transición` (e, opcionalmente, retrasar su acceso a las pistas) da a los fugitivos tiempo para recolocarse antes de que esa información se convierta en capturas inmediatas.

**Garantía de diseño ya validada en S0:** los mensajes se filtran **en el momento de emitirlos** y cada jugador tiene su propio flujo (D-020). Al reconectar, el convertido **no** recibe mensajes de cazador anteriores a su conversión, y las posiciones nunca se reenvían porque no se guardan en el flujo.

### 3.4 Prevención de eventos duplicados [PROPUESTA]
- Una conversión solo puede salir de una **captura confirmada**, ya sea por la confirmación del fugitivo o por su autodeclaración, y ambas exigen `team = runner` y `status = active` en el paso que se procesa.
- Los comandos de cada partida se procesan **en serie**: dos confirmaciones simultáneas sobre el mismo fugitivo producen una conversión y un rechazo (`already_captured`).
- `captureId` es único por partida (`<gameNo>-c<n>`), y el cliente descarta los eventos con un `seq` ya aplicado (D-020).
- Los comandos repetidos con el mismo `commandId` devuelven la respuesta guardada sin volver a ejecutarse (validado en S0).
- Si el convertido tenía una reclamación de captura **recibida** pendiente, desaparece con su captura. Como cazador no puede tener reclamaciones propias hasta `canTagFrom`.

### 3.5 Parámetros por definir [PARÁMETRO]
| Parámetro | Propuesta inicial (no aprobada) | Motivo |
|---|---|---|
| Cazadores iniciales | Según §4 (límite propuesto: de 1 a `max(1, floor(n/4))`) | Si hay muchos cazadores iniciales, la partida se acaba demasiado rápido |
| Ventaja inicial | De 1 a 10 min, como en Clásico | — |
| `T_transición` (el convertido no puede capturar) | 60 s | Tiempo para que los fugitivos se recoloquen |
| Visión de compañeros cazadores durante la transición | Sí, desde el primer instante | Le permite orientarse. No tiene riesgo para los fugitivos |
| Pistas en Infección | Las mismas que en Clásico | A valorar si con muchos cazadores sobran |
| Zona dinámica en Infección | Opcional, igual que en Clásico | — |

### 3.6 Final [PROPIETARIO, con un caso propuesto]
| Situación | Resultado |
|---|---|
| Sin fugitivos activos por conversión | **Ganan los cazadores** (todos infectados) [PROPIETARIO] |
| Se acaba el tiempo con ≥ 1 fugitivo libre | **Ganan los supervivientes** [PROPIETARIO] |
| El último fugitivo abandona sin ser capturado | [PROPUESTA] Sin ganador, igual que en Clásico |
| No queda ningún cazador (iniciales y convertidos se han ido) | [PROPUESTA] Sin ganador |
| Reconocimiento al "último superviviente" | [PREGUNTA] ¿Se muestra en el resultado? No cambia quién gana |

---

## 4. Asignación de equipos

### 4.1 Reglas [PROPIETARIO]
- Al crear la sala se elige **sorteo automático** o **selección manual**.
- Hay una **proporción configurable de cazadores**, con **límites seguros** según el tamaño del grupo.

### 4.2 Límites seguros [PROPUESTA]
Siempre: **al menos 1 cazador y al menos 1 fugitivo**.

| Modo | Cazadores (n = jugadores) |
|---|---|
| Clásico | De 1 a `floor(n/2)` (nunca más cazadores que fugitivos) |
| Infección (iniciales) | De 1 a `max(1, floor(n/4))` |

Proporción en la interfaz, como ajustes predefinidos [PROPUESTA]: **pocos** (1 de cada 5), **equilibrado** (1 de cada 3), **muchos** (1 de cada 2, solo en Clásico).
Cálculo: `cazadores = clamp(round(n × proporción), mínimo, máximo)`. Se recalcula si cambia `n` en la sala de espera.

### 4.3 Sorteo automático [PROPUESTA]
- Sorteo determinista en el servidor, con una semilla por sala y ronda, auditable en pruebas.
- **[PREGUNTA]** ¿Se respetan las preferencias de los jugadores (cazador o fugitivo) dentro del sorteo, como hace S0, o el sorteo es puro?

### 4.4 Selección manual [PROPUESTA]
- El anfitrión asigna cada jugador a un equipo en la sala de espera. Los jugadores ven su equipo.
- Los límites "≥ 1 y ≥ 1" bloquean el inicio. Salirse de la proporción configurada solo genera un **aviso** [PREGUNTA: ¿aviso o bloqueo?].

### 4.5 Diferencia con S0
S0 implementa preferencias por jugador más un sorteo con objetivo `ceil(n/4)`. Habrá que adaptarlo (D-031) cuando se apruebe §4.

---

## 5. Rondas sucesivas (revancha)

### 5.1 Reglas [PROPIETARIO]
Se documentan tres opciones para formar los equipos de la ronda siguiente. **Cuál o cuáles se ofrecen está pendiente**, y no hay ningún algoritmo definitivo de rotación aprobado.

**Definición [PROPUESTA]:** "sesión" es la secuencia de rondas en la misma sala, con el mismo código. Los recuentos de rondas se guardan **solo mientras vive la sala** (no hay estadísticas persistentes).

### 5.2 Opción A: sorteo nuevo
- **Comportamiento:** un sorteo independiente con la proporción vigente (§4.3).
- **Casos límite:** por azar, la misma persona puede ser cazadora varias rondas seguidas. Se acepta, y es la razón de existir de la opción C. Si `n` cambia, se recalcula el número de cazadores.

### 5.3 Opción B: los primeros capturados empiezan cazando
- **Comportamiento:** con `K` = cazadores necesarios en la ronda nueva (§4.2), son cazadores iniciales los `K` primeros capturados de la ronda anterior, por orden de captura del servidor (no puede haber empates, porque el procesamiento es en serie).
- **Casos límite y propuesta de tratamiento:**

| Caso | Propuesta |
|---|---|
| Hubo menos de `K` capturas | Se completa por sorteo entre el resto de jugadores de la ronda nueva |
| No hubo ninguna captura | Se aplica la opción A |
| Un capturado ya no está en la sala | Se salta y se toma el siguiente |
| Jugadores nuevos en la sala | Solo pueden ser cazadores mediante el sorteo de relleno |
| En Infección | "Capturado" significa "convertido". El orden es el de conversión |
| Los cazadores de la ronda anterior | Pasan a fugitivos salvo que se necesiten para el relleno [PREGUNTA] |

### 5.4 Opción C: rotación equilibrada
- **Objetivo:** que, a lo largo de la sesión, cada jugador sea cazador un número de rondas lo más parecido posible.
- **Comportamiento candidato [PROPUESTA, no definitiva]:** se eligen los `K` jugadores con **menos rondas como cazador inicial**. Los empates se resuelven por **más rondas desde su último turno de cazador**, y si persisten, por sorteo con semilla.
- **Casos límite que la regla tiene que resolver antes de aprobarse:**

| Caso | Problema | Opciones |
|---|---|---|
| Jugador que entra a mitad de sesión | Con 0 rondas como cazador, le tocaría siempre | (a) Empieza con el mínimo actual de la sesión. (b) Empieza con la mediana |
| Jugador que se va y vuelve | ¿Conserva su recuento? | (a) Sí, mientras viva la sala. (b) Se reinicia |
| `K` cambia entre rondas (cambia `n` o la proporción) | Los turnos no cuadran exactamente | Aceptar un desequilibrio de ±1 |
| Infección | ¿Cuenta ser convertido como "ronda de cazador"? | Propuesta: **no**, solo cuentan los cazadores iniciales |
| Selección manual en una ronda | ¿Cuenta para la rotación? | Propuesta: **sí**, cuenta lo que realmente jugó |
| Jugador que abandona una ronda en la que era cazador | ¿Cuenta? | Propuesta: sí, si jugó la fase `ACTIVE` |

### 5.5 Contradicción con lo implementado
S0 y `USER_FLOWS.md` F13 ofrecen "intercambiar roles", que **no** está entre las tres opciones. [PROPUESTA, D-037] Sustituirlo por las opciones A, B y C, más la selección manual. O bien conservarlo solo como atajo manual.

---

## 6. Zona dinámica

### 6.1 Reglas [PROPIETARIO]
- La zona debe poder **encogerse** y **cambiar de posición** durante la partida.
- Los **avisos previos, límites, tiempos y condiciones de victoria** son parámetros por decidir.

### 6.2 Modelo [PROPUESTA]
- Al empezar, el servidor genera un **calendario de versiones de zona** (inicio, centro y radio) a partir de los parámetros. La estructura ya existe en el motor (`zoneAt`), aunque el validador de S0 la limita a una versión.
- Cada cambio se **anuncia `T_aviso` antes**, mostrando ya la zona siguiente. Las zonas posteriores **no se revelan** por adelantado [PREGUNTA: ¿ocultas o visibles?].

### 6.3 Restricciones de seguridad [PROPUESTA, D-032]
1. **Contención:** cada zona nueva está **totalmente dentro** de la anterior. Nadie que esté dentro tiene que atravesar zonas que antes estaban fuera.
2. **Nadie necesita correr:** la distancia máxima que alguien tiene que recorrer para entrar en la zona nueva es `|desplazamiento del centro| + R_anterior − R_nueva`, y debe cumplir:
   `|desplazamiento| + R_anterior − R_nueva ≤ v_paso × T_aviso`, con `v_paso` = 1,2 m/s [H: paso normal, a validar].
   *Ejemplo:* con `T_aviso` = 3 min, como máximo 216 m.
3. **Radio mínimo:** la zona final no baja de `R_min` [PARÁMETRO, propuesta 100 m], porque por debajo el error del GPS (10–30 m) domina.
4. El aviso de cambio **nunca coincide** con una pista ni con el último minuto de partida [PROPUESTA].

### 6.4 Salir de la zona tras un cambio [PROPUESTA]
- El periodo de gracia se **reinicia** con cada cambio: `T_gracia_cambio` [PARÁMETRO, propuesta 60 s].
- Se mantiene el beneficio de la duda por la precisión: está fuera solo si `distancia − precisión > radio`.
- La consecuencia de estar fuera es la misma que con zona fija (visible para los cazadores). **No hay eliminación** [PROPUESTA: no se elimina a nadie por la zona, para no incentivar carreras].

### 6.5 Cazadores fuera de la zona: resolver la incoherencia de D-023 [PROPUESTA, D-033]
Exponer a los cazadores ante los fugitivos rompería la regla "los fugitivos nunca ven a los cazadores". Propuesta: un cazador fuera de la zona recibe un aviso y **no puede declarar capturas** mientras siga fuera. No se le expone.

### 6.6 Condiciones de victoria [PARÁMETRO]
- Propuesta: la zona **no cambia** las condiciones de victoria de Clásico ni de Infección.
- **[PREGUNTA]** ¿Debe existir alguna penalización por estar fuera de la zona al acabar el tiempo (por ejemplo, no contar como superviviente)? La propuesta es **no**, por seguridad.

### 6.7 Parámetros [PARÁMETRO]
| Parámetro | Propuesta inicial |
|---|---|
| Zona dinámica activada | Opcional por sala (desactivada por defecto) |
| Número de cambios | 2–4 |
| Primer cambio | Al 40 % de la duración de `ACTIVE` |
| Reducción por cambio | Radio × 0,7 |
| Desplazamiento máximo | Limitado por §6.3.2 |
| `T_aviso` | 3 min |
| `T_gracia_cambio` | 60 s |
| `R_min` | 100 m |

---

## 7. Pistas (pings)

### 7.1 Reglas [PROPIETARIO]
- Una pista muestra la **antigüedad real** de la ubicación.

### 7.2 Comportamiento (implementado en S0) y propuestas
- Cada entrada lleva: posición de la **última muestra conocida**, `ageMs` calculado con `measured_at` (D-021), precisión y disponibilidad (`CURRENT`, `STALE` o `UNAVAILABLE`). **Implementado y probado en S0.**
- Si el reloj es sospechoso, la entrada nunca se presenta como actual (D-021).
- [PREGUNTA] ¿Posición exacta con su círculo de precisión (como ahora) o difuminada a propósito? Propuesta: **exacta con círculo de precisión**.
- [DISPOSITIVO] La exactitud real de la ubicación depende del GPS: T12 en S1.

---

## 8. Escáner

### 8.1 Reglas [PROPIETARIO]
- El escáner es **limitado** y **no revela más información de la necesaria**.

### 8.2 Propuesta (D-034)
| Aspecto | Propuesta |
|---|---|
| Quién | Solo cazadores activos (en Infección, también los convertidos tras `T_transición` [PARÁMETRO]) |
| Cupo | `N_escaneos` por cazador y ronda [PARÁMETRO, propuesta 2], con un enfriamiento de `T_enfriamiento` [PARÁMETRO, propuesta 5 min] |
| Qué revela | **Solo un número:** "hay X fugitivos a menos de `R_escaneo` m de ti". Sin direcciones, identidades ni posiciones |
| `R_escaneo` | [PARÁMETRO, propuesta 100 m]. Nunca menor de 50 m, por el error del GPS |
| Qué muestras cuentan | Solo las de fugitivos `CURRENT`. Una muestra antigua o sospechosa no cuenta. La respuesta lo indica ("según ubicaciones recientes") |
| Aviso al escaneado | [PREGUNTA] ¿Se avisa a los fugitivos dentro del radio de que les han escaneado? Propuesta: **sí, con vibración**, por justicia |
| Antitriangulación | El cupo y el enfriamiento impiden combinar muchos escaneos desde puntos distintos para localizar a alguien |
| Fases | Solo en `ACTIVE`. Nunca durante la ventaja |

**Alternativa considerada:** revelar una celda aproximada. Se descarta porque da más información de la necesaria.

---

## 9. Capturas y disputas

### 9.1 Reglas [PROPIETARIO]
- Las capturas requieren **validación** y una **vía para gestionar disputas**.

### 9.2 Validación (implementada en S0)
Autodeclaración del fugitivo, o declaración del cazador con posiciones actuales, precisión suficiente, cercanía plausible y confirmación del fugitivo (`GAME_STATE_MACHINE.md` §7). **Probado en S0.**

### 9.3 Disputa [PROPUESTA, D-035]
1. Si el fugitivo responde "No", la reclamación pasa a **disputada**. Los dos lo ven, y el cazador recibe: "Captura disputada. Seguid jugando".
2. Hay un **enfriamiento entre esa pareja** de `T_disputa` [PARÁMETRO, propuesta 60 s]. Después, el cazador puede volver a reclamar con posiciones nuevas.
3. Las disputas de cada jugador se **cuentan** y aparecen en el resultado ("3 capturas disputadas"). Hacen de presión social, sin castigo automático.
4. Sin respuesta en 30 s, **no hay captura** (comportamiento de S0) [PREGUNTA: ¿se mantiene?].
5. **No hay arbitraje del anfitrión** por defecto, porque suele ser jugador y tendría conflicto de interés. Un **árbitro** que no juega queda para el modo organizador (enfoque C).
6. La norma física se mantiene: toque suave y "¡Pillado!". No vale capturar en la calzada.

---

## 10. Avisos y validación en dispositivos [DISPOSITIVO]

| Tema | Estado |
|---|---|
| Ubicación exacta (error real frente a precisión declarada) | Pendiente: S1 (T12) |
| Comportamiento con el móvil bloqueado y en segundo plano | Pendiente: S1 a S3 (T05, T06) |
| **Notificaciones sonoras** | **Contradicción:** M15 dice "solo vibración". [PROPUESTA, D-036] Vibración por defecto. Sonido opcional, desactivado por defecto y configurable por cada jugador. Validar en dispositivo cómo se comporta con el modo silencio |
| Avisos de cambio de zona y de escaneo con el móvil bloqueado | Pendiente: S1 en adelante |

---

## 11. Preguntas abiertas para el propietario (resumen)

1. **Alcance (D-030):** ¿entran en el MVP la zona dinámica, el modo Infección y el escáner? La Infección contradice la decisión aprobada en la sesión 2 sobre modos alternativos.
2. ¿Qué opciones de ronda se ofrecen: A, B, C o varias? ¿Se sustituye "intercambiar roles"?
3. Sorteo automático: ¿respeta preferencias o es puro?
4. Selección manual fuera de proporción: ¿aviso o bloqueo?
5. Zona dinámica: ¿zonas futuras ocultas o visibles? ¿Alguna penalización por acabar fuera?
6. Escáner: ¿se avisa al escaneado?
7. Captura sin respuesta en 30 s: ¿sigue siendo "no hay captura"?
8. Infección: valores de `T_transición`, cazadores iniciales y acceso a la última pista. ¿Se reconoce al "último superviviente"?
9. Parámetros numéricos de §3.5, §6.7, §8.2 y §9.3.
