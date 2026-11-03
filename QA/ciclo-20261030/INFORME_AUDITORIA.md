# THE OUTRUN · Auditoría del ciclo «estabilidad + modos + inicio» · 30/10/2026

> Fase de solo lectura. Cinco agentes:
> - A: motor;
> - B: QA multijugador;
> - C: modos;
> - D: inicio;
> - E: revisor independiente.
>
> No se modificó código. Scripts, registros y maquetas en el scratchpad de la sesión (`auditoria-ciclo/`), fuera del repo.
>
> **Respaldo previo:** `C:\Users\aange\Downloads\outrun-respaldo-20261030-004854-antes-ciclo-modos\`, con 275 archivos sin commit y el diff, sin `mapa.config.json`.

## 0. Estado inicial

- Rama `mapa-real`, HEAD `462016d`, 51 entradas sin commit.
- Línea base de pruebas:

| Suite | Resultado |
|---|---|
| Motor `engine/test` | 127/127 |
| Motor `sim/test` (en `npm test`) | 30 más; total 157 |
| Servidor | 78/78 |
| Cliente | 117/117 |

## 1. Problemas reproducidos y causas confirmadas

| # | Problema | Evidencia | Causa |
|---|---|---|---|
| E1 | **Abrir el juego en otra pestaña o ventana del mismo navegador expulsa a la anterior, que queda inutilizable** | Reproducido en interfaz real y con clientes Node (B: A5/X2; A: R2) | `localStorage` compartido. El servidor cierra la conexión anterior con 4001 `replaced` (`hub.ts` `resume`). Después: <ul><li>`net.js` la deja en `closed` para siempre;</li><li>`visibilitychange` no reconecta en `closed`;</li><li>el aviso dice «Vuelve al inicio» sin botón;</li><li>`command()` con la conexión cerrada no se resuelve nunca, así que «Abandonar» se cuelga.</li></ul> |
| E2 | **Durante la partida nadie ve que otro jugador ha perdido la conexión** | Código (`app.js` `onEvent` no trata `player_connection`; solo `playerRow` en la sala) | Falta interfaz |
| E3 | **No hay periodo de gracia ni política de abandono** | B: C2 (7 min fuera, sigue `active`); A: R1 (15 min) | `connection` solo cambia `connected`. El desconectado: <ul><li>sigue activo hasta el final;</li><li>cuenta como superviviente;</li><li>es **incapturable**, porque la reclamación exige una lectura suya de 15 s o menos (`engine.ts` `claimTag`).</li></ul> |
| E4 | **Doble socket al volver a primer plano** y `player_connection` duplicado | B: X1/A3; A: R3 | `start()` con un temporizador de reconexión pendiente. El servidor ejecuta `connection:true` en cada reanudación aunque el jugador ya estuviera conectado (`hub.ts` `resume`). |
| E5 | **Una página congelada sigue «conectada» para el servidor** | B: A3 (300 s congelada, sin cierre) | El temporizador de inactividad se reinicia con los pong de la pila de red (`ws.ts`) |
| E6 | **El cazador pierde «Esperando confirmación» al recargar** | Código (`view.ts`: solo `pendingClaimForMe`) | La instantánea no lleva `pendingClaimByMe` |
| E7 | **En la sala de espera, un desconectado bloquea el inicio** y la única salida es `kick`, que bloquea su dispositivo | Código (`engine.ts` `start`, `kick`) | — |

**Lo que funciona** (verificado por B):
- la salida voluntaria avisa a todos (evento, aviso en pantalla e instantánea);
- recargar la página reanuda la partida;
- un corte de 7 min se recupera sin eventos duplicados;
- la captura rechazada funciona en servidor y en interfaz;
- los resultados son idénticos en 4 clientes;
- la revancha funciona tras una desconexión;
- una pestaña en segundo plano durante 400 s no desconecta (Chrome de escritorio).

**Hipótesis no reproducidas:**
- el navegador integrado de WhatsApp o Instagram usa un almacenamiento distinto: la sesión «no existe»;
- un túnel reiniciado cambia el origen;
- Android descarta la pestaña.

**Corrección del revisor E:** «inicio → `forget()` → `already_joined`» estaba exagerado. En partida no hay botón de inicio, y el error real a mitad de partida sería `game_in_progress`.

## 2. Soluciones técnicas (sin cambiar reglas)

1. **`net.js`:**
   - sin doble socket;
   - `command()` resuelve `offline` si la conexión está cerrada;
   - reconectar en `pageshow` y `online`;
   - el cierre 4001 no borra la sesión y muestra «La partida está abierta en otra pestaña» con un botón **manual** «Jugar aquí»; si fuera automático, dos pestañas se robarían la sesión en bucle.
2. **Servidor:**
   - `connection:true` solo si el jugador no estaba conectado;
   - `pendingClaimByMe` en la instantánea.
3. **Presencia por mensajes de la aplicación** (WebSocket de aplicación o `POST /api/loc` autenticado), no por los pong de la pila de red.
4. **Presencia visible en la partida** («sin conexión»).
5. **Política de gracia:** la §4 trae la decisión.

## 3. Reglas ya documentadas

- Infección:
  - **§3.1 y §3.6 (propietario):** cazadores iniciales, conversión al confirmar la captura, final cuando todos son cazadores o se acaba el tiempo, y en ese caso ganan los supervivientes.
  - D-030: ampliación futura.
  - D-045: abierta.
- **Sardines y Fox Hunt:** no tienen ninguna regla en el repo; solo el nombre (BACKLOG P3, Plan F5).
- **Reglas comunes:**
  - D-031: proporciones como hipótesis;
  - D-033: un cazador fuera de zona no captura;
  - D-035: una disputa no elimina;
  - D-038: ninguna cifra está aprobada;
  - D-042: inicio y ventaja;
  - D-056: revancha con sorteo, equipos al final.
- **GAME_STATE_MACHINE:**
  - §5.2: el desconectado sigue en juego;
  - §5.3: quien abandona no vuelve a esa partida.

## 4. Decisiones pendientes del propietario

Recogidas en la conversación del 30/10; el resultado se anota en D-057.

1. Periodo de gracia y qué ocurre al vencer.
2. Parámetros de Infección no aprobados:
   - transición del convertido;
   - cazadores iniciales;
   - si el convertido recibe la última pista;
   - si los convertidos ganan;
   - mínimo de jugadores.
3. Fox Hunt: elegir interpretación. Sardines: definir reglas o aplazar.
4. Inicio:
   - nombre del modo base;
   - lista de «Próximamente»;
   - fuente.

## 5. Bajo riesgo frente a lo que necesita autorización

| Bajo riesgo (no cambia reglas) | Necesita autorización |
|---|---|
| Arreglos de `net.js`, pantalla del 4001, `pendingClaimByMe`, eventos sin duplicar | Expiración del periodo de gracia → `left` (cambia resultados) |
| Presencia visible | Reglas abiertas de Infección |
| `modes.ts` solo con Clásico (sin cambio de comportamiento) | Cualquier regla de Fox Hunt y Sardines |
| Pruebas nuevas (pestaña duplicada, rechazo en la interfaz, etc.) | Anunciar modos «Próximamente» |
| Rediseño del inicio con los mismos contratos | — |

## 6. Orden recomendado (revisor E)

1. Pruebas que reproducen E1, E4 y E6.
2. Arreglos de `net.js` y del servidor.
3. Pantalla del 4001.
4. Presencia en partida.
5. Política de gracia.
6. `modes.ts` con Clásico y `mode` opcional en la configuración.
7. Infección completa.
8. Rediseño del inicio en un módulo propio.
9. Siguiente modo si se aprueba.

Estabilidad, modos e inicio tocan las mismas funciones de `app.js`, por eso van en serie y no en paralelo.

## 7. Comparación de modos (agente C)

| | Infection | Fox Hunt (interpretación D) | Sardines |
|---|---|---|---|
| Complejidad | M | S–M | L |
| Reutilización del motor | Muy alta | Alta | Media |
| Riesgo para Clásico | Medio (toca la captura y el final) | Bajo | Alto (estados y visibilidad nuevos) |
| Claridad de reglas | Alta (documentadas) | Media (hay que aprobarla) | Baja |
| Valor con amigos | Alto | Alto en sesiones cortas | Alto, pero con dudas físicas (GPS bajo techo, grupos) |

**Orden recomendado:** Infection → Fox Hunt → Sardines.
