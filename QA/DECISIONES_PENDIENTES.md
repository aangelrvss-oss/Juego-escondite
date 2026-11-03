# Decisiones pendientes y bloqueos para la prueba

Detalle completo de cada decisión en `docs/product/DECISIONES_PENDIENTES.md`. Aquí solo lo que afecta a la prueba física.

| Id | Decisión que falta | Por qué importa | Qué queda bloqueado | Alternativas | Recomendación técnica |
|---|---|---|---|---|---|
| **D-035** | Qué pasa cuando cazador y fugitivo no están de acuerdo en una captura | Hoy una captura por reclamación **necesita que el fugitivo confirme**. Si pulsa «No» o no responde en 30 s, no hay captura y nadie arbitra | Validar capturas disputadas; cualquier escenario de mala fe | (a) Como ahora: sin captura si no confirma. (b) Captura por defecto si no responde. (c) Arbitraje del anfitrión. (d) Contar los rechazos repetidos como incidencia | Para la prueba entre conocidos, mantener (a) y **observar** cuántas reclamaciones se rechazan. Decidir antes de jugar con desconocidos |
| **D-055** | Proveedor de cartografía, coste y condiciones | No se ha visto el mapa real; condiciones del plan gratuito y uso comercial sin verificar | Verificar calles, nombres y atribución reales (F-06) | MapTiler (clave pública restringida); otro proveedor (`estiloUrl`); autoalojado (Protomaps) | MapTiler con una clave solo para la prueba, revocada después |
| **D-047** | Frecuencia de las pistas y lo que ve cada rol | Hay tramos largos sin información nueva (el cazador en la huida, todos entre pistas) | Juzgar si la partida aburre | Pistas más frecuentes; zona aproximada en vez de punto exacto | Probar con pistas cada 2 min y anotar en qué momentos se aburren |
| **D-043 / D-006** | Radio o voz entre jugadores | No existe en la app; la coordinación del equipo depende de un canal externo | Nada técnico; afecta a la experiencia | Canal externo declarado; prototipo de voz | Para la prueba: acordar una llamada de grupo o un chat externo |
| (nueva) | Qué hacer con las marcas antitrampas (`implausible_speed`, `mock_location`, `repeated_tag_rejections`) | Hoy **solo se registran**: no se muestran ni bloquean nada. No es una protección contra un GPS falso | Nada para una prueba entre amigos | Mostrarlas en el Mission Report; aviso al anfitrión; expulsión | Sin cambios hasta jugar con desconocidos |
| (nueva) | Sala de espera larga (reglas siempre abiertas) | El anfitrión desplaza mucho; las reglas apenas se leen | Nada | Reglas plegables; pestañas | Decidir si «reglas visibles para todos» admite una sección plegada |

### Añadidas en la preparación del primer playtest (29/10/2026, `QA/playtest-20261029/`)

> **Resueltas el 29/10/2026** (aprobadas por el propietario e implementadas; ver `QA/playtest-20261029/decisiones/INFORME_DECISIONES.md`):
> - revancha con sorteo nuevo;
> - equipos de todos al terminar;
> - nombre de quien sale;
> - pista sin capturados;
> - intervalo de pistas menor que la duración.
>
> La tabla de debajo queda como registro de lo que se planteó.

| Id | Decisión que falta | Por qué importa | Qué queda bloqueado | Alternativas | Recomendación técnica |
|---|---|---|---|---|---|
| **D-037 (revancha)** | Equipos de la revancha | Hoy la revancha **repite los mismos equipos** (el botón envía `swapRoles:false` y el motor conserva las preferencias). D-037 solo aprobó «sorteo nuevo» o «primeros capturados como cazadores», y con equipos repetidos cada uno sabe su rol antes de la cuenta atrás (D-042.1) | Que todos prueben los dos roles sin crear otra sala | (a) Sorteo nuevo por defecto. (b) Elegir en el botón: «mismos equipos» / «sorteo». (c) Como ahora | (b), o (a) si se quiere lo más simple. Para el playtest: crear sala nueva o asignar a mano |
| **Equipos al final** | ¿Se revelan los equipos de todos en el Mission Report? | El motor oculta el equipo rival también en FINISHED (`teamVisibleTo`), así que el informe **no puede listar quién escapó** ni los equipos. En la práctica ya se deducen (cada uno ve su equipo) | Sección «Fugitivos que escaparon» (USER_FLOWS F12) y alineaciones | (a) Revelar todos los equipos en FINISHED (cambio en `view.ts` y prueba de privacidad). (b) Como ahora | (a): no protege nada ocultarlo al final y mejora mucho el informe. Requiere tu autorización |
| **Nombres de quien sale** | Nombre de quien sale de la sala antes de ver el informe | La instantánea quita a quien sale; en el informe aparece como «Alguien» (igual para todos) | Cronología completa si alguien se va pronto | Guardar el nombre en cada captura del motor | Hacerlo junto con «Equipos al final» |
| **Pista de un capturado** | La última pista conserva la posición de un fugitivo ya capturado o que abandonó hasta la pista siguiente | GAME_STATE_MACHINE §5.3: quien es capturado deja de compartir su ubicación al instante. La interfaz ya no la muestra, pero el servidor la sigue enviando al cazador | Nada para el playtest (la interfaz la oculta) | Quitar la entrada de `lastPing` en el motor al capturar o abandonar | Corregir en el motor (cambio pequeño, con prueba) |
| **Intervalo ≥ duración** | El motor acepta pistas cada 10 min en 10 min de persecución (ninguna pista) | La interfaz ya no lo ofrece, pero el motor no lo impide | Nada para el playtest | Validar `pingIntervalMs < durationMs` en `validate.ts` | Corregir en el motor |

## Bloqueos externos

- **Clave de MapTiler** (actualizado el 29/10/2026): creada, rotada y restringida por origen. Validada en Chrome desde `http://127.0.0.1:8787`: el mapa real carga y un origen no autorizado recibe 403. **Falta, el día de la prueba, añadir la dirección del túnel** a los orígenes permitidos; si no, el juego usa el radar.
- **JDK y SDK de Android, no autorizados:** no se puede compilar ni probar la APK, que es la que mantiene el GPS con la pantalla bloqueada. La prueba será con el **navegador**.
- **Teléfonos:** todo lo físico (GPS real, cobertura, pantalla, batería, latencia) solo se puede verificar en la prueba.
