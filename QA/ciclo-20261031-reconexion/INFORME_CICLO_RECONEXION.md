# Ciclo de desconexión y reconexión · 31/10/2026

## 1. Problema original
En la prueba con dos móviles reales (noche del 30 al 31/10), «al dejar los móviles apagados durante un rato se produjo una pérdida de conexión».

Funcionaron:
- la pantalla de inicio;
- la disputa de una captura (rechazar y luego confirmar);
- la revancha.

## 2. Diagnóstico y evidencias

**Causa confirmada: se suspendió el portátil que hacía de servidor, no los móviles.**

| Evidencia | Qué dice |
|---|---|
| Registro de diagnóstico del servidor (`registros/00-informe-diagnostico-prueba-fisica.md`, generado de una copia de `%USERPROFILE%\OutrunDiagnostico\diagnostico-20261030-235741.jsonl`) | A las **0:10:44** los dos móviles pierden el socket **en el mismo segundo** (`socket_error`), en la huida de la revancha. Después, **ningún hecho durante 3 h**: ni siquiera el fin de la huida, que tocaba a las 0:12:28. A las **3:10:52** el servidor procesa de golpe 3 h de plazos (persecución, 6 pistas, final por tiempo, cierre de la sala) |
| Registro de eventos de Windows (Kernel-Power / Power-Troubleshooter) | **00:10:51** «El sistema está entrando en suspensión». **03:10:56** «Hibernate from Sleep – Fixed Timeout» (despierta unos segundos y pasa a hibernación). Reanudación a las **11:00:37** |
| Configuración de energía (comprobada la noche anterior) | Con batería, el equipo se suspende a los 10 min sin uso; el portátil iba con batería |
| Túnel (`cloudflared`) | Tras la suspensión, 0 conexiones y la dirección `*.trycloudflare.com` ya no existe. Le pasó también al túnel anterior tras la suspensión del 30/10 a las 21:37 |

**Comprobado como correcto en la prueba real** (mismo registro):
- **Móvil bloqueado:** J2 perdió el socket (0:06:50), a los 30 s apareció «sin conexión» y **volvió 2 min 44 s después con la misma identidad** (`resume`, 23 eventos recuperados). Siguió jugando: reclamación rechazada, reclamación confirmada, final, revancha.
- **Página congelada:** J1 quedó con el socket abierto pero sin mensajes y a los 30 s apareció «sin conexión» (D-057). Recargó (`client_1001`) y volvió en 1 s con su sesión.
- No hubo duplicados, roles cambiados ni estados contradictorios.

**Causas confirmadas, distintas del fallo del móvil:**
1. **El ordenador del servidor se suspende por inactividad:** servidor y túnel caen a la vez y nadie puede volver.
2. **Un túnel rápido no sobrevive a una suspensión.** Al abrir otro, la dirección cambia. Como la sesión del navegador va ligada a la dirección (`localStorage` por origen), **con una dirección nueva nadie puede reanudar su partida**: hay que entrar de nuevo y solo se puede en la sala de espera.
3. **MapTiler solo admite las direcciones autorizadas:** cada túnel nuevo hay que añadirlo en «Allowed HTTP origins», o se juega con el radar.

**Hipótesis no confirmadas:** ningún fallo de reconexión del móvil. No se ha reproducido en un móvil real nada más que lo anterior.

**Comportamiento conforme a las reglas, no un fallo:** con más de 5 min sin señal, el jugador queda fuera (D-057). Sigue pudiendo ver el final y unirse a la revancha. Cambiarlo sería una decisión de producto.

**Límites del entorno:** los móviles solo se observan a través del registro del servidor. El navegador emulado no reproduce cómo congela iOS o Android una página bloqueada.

## 3. Código revisado (fase 1)
| Tema | Dónde | Conclusión |
|---|---|---|
| Conexión, reintentos y sonda | `net.js` | Reintentos de 0,5 a 8 s. Al volver a primer plano (`visibilitychange`, `pageshow`, `online`) envía una sonda. Si en 25 s no llega nada del servidor y la sonda no responde en 5 s, reconecta. Bien |
| Identidad y duplicados | `hub.ts` (`resume`, cierre 4001); `engine.ts` (`join` por dispositivo, C2) | Se reanuda con jugador y secreto. Una segunda conexión cierra la primera (4001). Sin duplicados |
| Presencia | `hub.ts` `seen()`; `engine.ts` | 30 s → «sin conexión»; 5 min → fuera (D-057). Cuenta cualquier mensaje de la app; los pong de la red no cuentan |
| Suspensión del propio servidor | `hub.ts` `checkSuspended()` / `forgiveAbsence()` | Se ejecuta antes de procesar nada y reinicia el plazo de todos (D-057 §1). Bien, pero **sin prueba** (dependía de la hora real) y **sin rastro en el diagnóstico** |
| Estado tras reconectar | `hub.ts` (instantánea filtrada + eventos perdidos) | El servidor manda en el reloj, el equipo, las capturas y la fase: el cliente lo recibe todo al reanudar |
| Comandos pendientes | `net.js` | **Fallo:** al reconectar se reenviaban todos, también una reclamación o un «Sí, me ha pillado» pulsados sin cobertura minutos antes (R-09 de la revisión de capturas) |
| Pruebas existentes | `presence`, `reconnect`, `presencia-real`, `lockscreen`, `replay`, `net-regresiones`; e2e `conexion` | Cubren el corte breve, más de 4 min, más de 5 min, la página congelada, la pestaña duplicada, reconectar durante una reclamación y la pista. Faltaba: suspensión del servidor, reintentos simultáneos, reconexión en Infección y en el zorro con revancha |

## 4. Archivos modificados
| Archivo | Cambio |
|---|---|
| `server/iniciar-servidor.ps1` | Mientras el servidor está en marcha, pide a Windows que no suspenda el equipo por inactividad (`SetThreadExecutionState`) y lo libera al pararlo. Nueva opción `-PermitirSuspension`. Avisa de que cerrar la tapa sí lo suspende |
| `server/hub.ts` | Nueva opción `wallNow` (reloj de pared inyectable, por defecto `Date.now`; solo para pruebas). La suspensión detectada queda en el diagnóstico (`server_suspended`, con los segundos y los jugadores perdonados) |
| `server/informe-diagnostico.mjs` | Alerta «el ordenador del servidor estuvo suspendido». En registros antiguos, alerta por un hueco de 2 min o más sin ningún hecho con una partida en juego. `socket_error` explicado |
| `mobile/www/js/net.js` | Al reconectar, `claim_tag`, `respond_tag` y `self_tag` pendientes desde hace más de 20 s no se reenvían: se responden `stale_action`. El resto de comandos se reenvía igual |
| `mobile/www/js/game-view.js` | Solo el texto de `stale_action`: «Sin conexión cuando lo pulsaste: no se ha enviado. Si sigue haciendo falta, vuelve a pulsarlo.» |
| `server/test/reconexion-ciclo.test.mjs` (nuevo) | 9 pruebas |
| `mobile/test/net-regresiones.test.mjs` | 4 pruebas nuevas |

**Sin cambios:**
- las reglas y los plazos (30 s y 5 min);
- la pantalla de inicio y el resto de la interfaz;
- MapTiler y las credenciales.

No hay ninguna regla de captura cambiada.

## 5. Corrección
- **Causa raíz (operativa):** el script oficial impide la suspensión por inactividad mientras sirve la partida.
  - **Comprobado:** la llamada a Windows tiene éxito (devuelve el estado anterior, distinto de 0) y el script no tiene errores de sintaxis y conserva el BOM.
  - **No comprobado:** que el equipo no se suspenda de verdad tras 10 min sin uso. Exige esperar ese tiempo o permisos de administrador (`powercfg /requests`).
  - **Ahora mismo:** el servidor en marcha (PID 2284) se arrancó con el script antiguo. Para esta prueba hay abierta una ventana aparte, «THE OUTRUN – mantener despierto» (PID 21864), que hace lo mismo sin tocar el servidor.
- **Suspensión del servidor:** ahora tiene prueba y deja rastro en el diagnóstico. El comportamiento (D-057 §1) no cambia.
- **Acciones obsoletas (requisito 7):** las acciones de captura que esperaban durante un corte ya no se ejecutan tarde.

## 6. Pruebas ejecutadas y resultados exactos (`registros/`)
| Tipo | Prueba | Resultado |
|---|---|---|
| Unitaria + integración | `server/test/reconexion-ciclo.test.mjs` | 9/9 en 3 ejecuciones. Con `hub.ts` sin la corrección (copia fuera del repositorio) fallan las 2 de suspensión y el control pasa |
| Unitaria (cliente de red) | `mobile/test/net-regresiones.test.mjs` | 9/9. Con `net.js` sin la corrección fallan las 2 de acciones caducadas y las otras 2 pasan |
| Tipos | `tsc` | OK |
| Motor + S0 | 252/252 | `02-motor` |
| Servidor (WebSocket reales) | 128/128 | `03-servidor` (incluye las 9 nuevas) |
| Cliente | 152/152 | `04-cliente` |
| Simulador | 15/15 | `05-simulador` |
| Partidas completas (10 bots + revancha, 3 modos) | 3/3 | `06-escenarios-completos` |
| Demo | 62/62 | `07-demo` |
| Navegador: `web-flow` | 42/42 | `11-e2e-web-flow` |
| Navegador: `conexion` | **1 fallo y 2 aciertos (10/10)** | `10-e2e-conexion*` |
| Análisis de la prueba física real | Registro del servidor y de Windows | Ver §2 |

**Sobre el fallo de `conexion`:** fue en la espera previa de «lecturas recientes y estables» del GPS emulado (20 s), antes de cualquier desconexión, con poca memoria libre (579 MB). Se registra como **intermitente, no resuelta**; no está relacionado con los cambios.

**Casos pedidos y dónde se prueban:**

| Caso | Prueba |
|---|---|
| Desconexión breve y reconexión | `presence.test` («se corta 4 min»), `reconnect.test`, e2e `conexion` |
| Suspensión prolongada del navegador | `presence.test` y `presencia-real` («página congelada»), `lockscreen.test` |
| Pérdida de red y recuperación | e2e `conexion` (modo sin conexión), `lockscreen` («conexión muerta») |
| Reconexión antes del límite | `presence.test`, `reconexion-ciclo` (Infección y zorro) |
| Desconexión que supera el límite | `presence.test`, `presencia-real` |
| Jugador retirado que intenta volver | `presence.test` («al volver ve por qué, el final y la revancha») |
| Reintentos simultáneos | `reconexion-ciclo` («dos intentos de reanudar a la vez») y `presence.test` («pedir conexión varias veces») |
| Reconexión durante una captura o disputa | `reconnect.test` (el fugitivo sin cobertura ve la reclamación) y `presence.test` (el cazador la sigue viendo) |
| Reconexión en Infección | `reconexion-ciclo` (el convertido conserva su equipo y su espera; `tag_cooldown`) |
| Reconexión en la Caza del zorro | `reconexion-ciclo` (un solo zorro, el mismo, visible para los cazadores) |
| Reconexión seguida de revancha | `reconexion-ciclo` |
| Efectos sobre el resto | «sin conexión» / «ha vuelto» en los demás (pruebas anteriores) |
| Estado sin alterar el resultado | `reconexion-ciclo` (3 h de suspensión: el resultado es el del motor), escenarios completos |

## 7. Pruebas que no se han podido realizar
- **Ningún móvil real** en este ciclo. Solo se ha analizado el registro de la prueba anterior.
- Que Windows **no se suspenda de verdad** con el script nuevo (§5).
- **Bloqueo real de iOS y Android:** cómo congelan el navegador. Se prueba con navegadores de escritorio y con páginas congeladas simuladas.

## 8. Riesgos pendientes
1. **Cerrar la tapa o pulsar el botón de encendido suspende el portátil igualmente.** Configura «al cerrar la tapa: no hacer nada» o no la cierres.
2. **El túnel rápido cambia de dirección** cada vez que se abre:
   - con una dirección nueva no se puede reanudar una partida en curso;
   - hay que autorizar la dirección en MapTiler.
   - Una dirección fija (túnel con nombre de Cloudflare) necesita cuenta y dominio: es una decisión tuya.
3. **Con la pantalla apagada, el navegador del móvil no envía nada:** «sin conexión» a los 30 s y fuera a los 5 min (regla vigente). La app nativa (Android) sí envía la ubicación con la pantalla bloqueada, pero hoy no se usa.
4. **El servidor en marcha (PID 2284)** usa `hub.ts` anterior a este ciclo: sin el registro `server_suspended`. Los cambios del cliente (`net.js`) sí se sirven ya. Para tener todo, reinícialo con el script cuando no haya partida.
5. **Capturas:** ver `REVISION_CAPTURAS_FASE5.md`. Lo más grave, todo pendiente de decisiones de producto:
   - R-01: fugitivo sin GPS válido;
   - R-02: D-035 sin implementar, el fugitivo decide;
   - R-03: ubicación falsificable con una app de ubicación simulada.

   **Fallo nuevo sin decisión de producto pendiente, sin corregir en este ciclo** porque afecta a la validación de capturas: **R-07**. El móvil reenvía la última lectura cada 5 s y eso puede «confirmar» un pico aislado del GPS. Su coste de corrección es bajo y lo propongo para el siguiente ciclo.
6. **e2e `conexion`:** intermitente en la espera del GPS emulado (1 de 3).

## 9. Procedimiento exacto con dos móviles reales
**Antes:**
1. Portátil **enchufado**, tapa abierta.
2. Si arrancas el servidor de nuevo: `.\server\iniciar-servidor.ps1` debe mostrar «El equipo no se suspenderá por inactividad…». Ahora mismo lo cubre la ventana «mantener despierto».
3. Túnel abierto. Dirección actual: `https://book-arrives-proteins-array.trycloudflare.com`. Si quieres el mapa, añádela en MapTiler («Allowed HTTP origins»).
4. Anota la hora de inicio: el diagnóstico queda en `%USERPROFILE%\OutrunDiagnostico\`.

**Prueba (Clásico, 2 móviles A y B):**
1. A crea la partida y B entra con el enlace. «Estoy listo» en los dos; A pulsa **Empezar partida**.
2. **Bloqueo corto:** en la huida, B bloquea la pantalla 1 min y la desbloquea.
   - **Esperado:** A ve «Sin conexión: B» a los ~30 s y «B ha vuelto» al desbloquear. B vuelve a su partida con su rol y el reloj correcto.
3. **Bloqueo de 4 min** en la persecución: lo mismo, y la partida sigue.
4. **Corte de red:** B activa el modo avión 45 s y lo quita. Esperado: igual que el punto 2.
5. **Captura con corte:** A reclama a B. B no responde, bloquea 10 s, desbloquea y confirma.
   - **Esperado:** si no han pasado 30 s, la reclamación sigue y se confirma. Si han pasado, caduca sin captura.
6. **Acción sin cobertura:** B en modo avión. A reclama (A tiene red). B pulsa «Me han pillado» sin red, espera más de 20 s y quita el modo avión.
   - **Esperado:** B ve «Sin conexión cuando lo pulsaste: no se ha enviado…» y no hay captura.
7. **Más de 5 min:** B bloquea más de 5 min.
   - **Esperado:** A ve que B ha quedado fuera. Al volver, B ve «Estás fuera de la partida» y después el final.
8. **Revancha:** A termina, propone la revancha y B se une. Deben estar los dos, sin duplicados.
9. **Durante todo el rato:** el portátil no se suspende (su pantalla puede apagarse, pero no la tapa).
10. **Al acabar:** Ctrl+C en el túnel y en el servidor (genera el informe de diagnóstico). Cierra la ventana «mantener despierto».

## 10. Checklist de revancha y modos
- [ ] Clásico: revancha tras una desconexión (punto 8); sorteo nuevo; nadie duplicado.
- [ ] Infección (4 o más): un convertido bloquea 1 min y vuelve: sigue cazador y su espera de 60 s no se reinicia. La tarjeta «Te han infectado» sale una vez.
- [ ] Caza del zorro (3 o más): el zorro bloquea 40 s y vuelve: sigue siendo el único zorro y los cazadores ven «El zorro es X».
- [ ] Tras cada partida, el informe es igual en todos los móviles.
- [ ] El diagnóstico del servidor no muestra «estuvo suspendido» ni huecos largos.

## 11. Recomendación
**Se puede volver a probar físicamente.**
- La pérdida de conexión observada la causó la suspensión del portátil, y ahora está mitigada: con el script para próximos arranques y con la ventana «mantener despierto» para el servidor actual.
- La reconexión del móvil funcionó en la prueba real y está cubierta por las pruebas.

Condiciones:
- portátil enchufado y **sin cerrar la tapa**;
- no reiniciar el túnel durante una partida;
- autorizar la dirección nueva en MapTiler si quieres el mapa.

No queda ningún bloqueo técnico conocido para la prueba. Quedan pendientes las decisiones de producto sobre capturas (fase 5) y R-07.
