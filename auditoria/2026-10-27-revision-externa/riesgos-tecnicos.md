# Riesgos técnicos para una partida en la calle, y verificación del mapa

Cada punto indica de dónde sale:
- **[DEMOSTRADO-SIM]:** lo prueba una prueba automatizada o de navegador, con datos simulados;
- **[INSPECCIÓN]:** sale de leer el código; ninguna prueba lo demuestra;
- **[REQUIERE FÍSICO]:** solo se puede saber con teléfonos reales en la calle.

**Nada de este documento demuestra que el GPS, el segundo plano o la sincronización funcionen en teléfonos reales.**

## 1. Verificación del mapa: tres situaciones

| Situación | ¿Hecha? | Qué se sabe |
|---|---|---|
| **A. Mapa con datos simulados** (estilo local o calles sintéticas, GPS emulado, navegador) | **Sí** | `map.e2e` 26/26 y la grabación. Detalle debajo |
| **B. Mapa con cartografía real del proveedor** (MapTiler) | **No** | No hay clave. `mobile/www/mapa.config.json` existe **sin clave** (`{"proveedor":"ninguno"}`, creado por `npm run vendor`), y Git lo ignora |
| **C. Mapa en un teléfono físico con GPS real** | **No** | Nunca se ha probado |

**Comprobado en la situación A** [DEMOSTRADO-SIM]:

| Aspecto | Resultado |
|---|---|
| ¿Carga cartografía externa? | **No en ninguna prueba.** Las peticiones externas se bloquean y cuentan como fallo: 0. MapLibre carga y dibuja con WebGL un estilo local |
| ¿Se actualizan los marcadores? | Sí: el mismo elemento se mueve y uno nuevo aparece o desaparece según lo que autoriza el servidor |
| ¿Zoom y posición estables? | Sí: menos de un 3 % de variación tras la rueda, el pellizco y el arrastre táctiles emulados, 4 envíos de posiciones y muchos redibujados. El mapa no se recrea |
| ¿Zona y encuentro correctos? | Sí: círculo del radio configurado y cuadrado de encuentro (`circleRing` a ±1 % del radio en Node) |
| ¿Solo posiciones autorizadas? | Sí: la fugitiva no ve a la cazadora y la cazadora no ve a los fugitivos hasta la pista. El filtro lo hace el servidor (`engine/src/view.ts`) y el mapa solo dibuja lo recibido |
| ¿Conexión y antigüedad visibles? | Sí: aviso en el mapa, marcadores en gris sin conexión, y posiciones antiguas atenuadas y discontinuas con su antigüedad |
| ¿Alternativa si no carga? | Sí: radar SVG con el motivo, en caso de falta de configuración o clave rechazada (403), y «Reintentar el mapa». La partida sigue |
| ¿Atribución visible? | Sí, sin plegar y sin tapar botones, con un estilo de prueba que la declara. **Con la de MapTiler, sin ver** (situación B) |
| ¿Clave configurada y restringida? | **No aplica: no hay clave.** Riesgo R-11 |

**Qué hace falta para la situación B:**
1. Una clave de MapTiler creada por vosotros en <https://cloud.maptiler.com/> (*API keys*).
2. Restringida en *Allowed HTTP origins* a `http://127.0.0.1:8787` y a la dirección del túnel de ese día.
3. Copiada a `mobile/www/mapa.config.json` (`mobile/MAPA.md`, paso 3).

Después hay que abrir una partida en el ordenador y comprobar que se ven calles, nombres, edificios y la atribución «© MapTiler © OpenStreetMap contributors».

## 2. Riesgos

| Id | Riesgo | Tipo | Detalle | Qué hacer |
|---|---|---|---|---|
| R-01 | **Pantalla bloqueada o app en segundo plano = sin GPS (navegador)** | [INSPECCIÓN] + [REQUIERE FÍSICO] | En el navegador, la ubicación solo llega con la página delante (`location.js`). Se pide mantener la pantalla encendida (`wakeLock`) y se avisa. La app Android tiene un servicio nativo que sigue enviando con la pantalla bloqueada, pero **esa APK no se ha probado en una partida** | Jugar con la pantalla encendida. Probar el bloqueo de pantalla (lista física, punto 6) |
| R-02 | **Precisión insuficiente para capturar** | [INSPECCIÓN] + [REQUIERE FÍSICO] | Reclamar exige precisión de 30 m o mejor en los dos jugadores, lecturas de menos de 15 s y estar a menos de `min(5 + precisión del cazador + precisión del fugitivo, 40)` m (`engine/src/constants.ts`, `TAG`). Entre edificios, 20–50 m de precisión es habitual | Medir la precisión real en la zona de juego antes de elegirla |
| R-03 | **El GPS del navegador puede no renovarse tras un corte y una reconexión** | [DEMOSTRADO-SIM, intermitente] | 2 de 18 ejecuciones de `map.e2e` (sesión anterior; hoy 1 de 1 sin fallo). Tras la reconexión no llegaron lecturas nuevas al servidor, y la pantalla mostraba «Lectura antigua (hace 25 s)». **Causa sin confirmar** (geolocalización emulada o cliente) | Prueba física de modo avión (lista, punto 5); mirar el registro `DIAG_FILE` si se repite |
| R-04 | Frecuencia y retraso de las posiciones | [INSPECCIÓN] | El móvil envía como mucho 1 lectura por segundo (y la repite cada 5 s); el servidor acepta 1 por segundo y jugador y reparte las posiciones visibles **cada 5 s** (`hub.ts`). Un compañero puede verse con 5–10 s de retraso; las pistas son fotos con su antigüedad | Aceptado por diseño; medir en la calle |
| R-05 | Latencia del túnel y de los datos móviles | [REQUIERE FÍSICO] | Probado de extremo a extremo solo desde el ordenador (18 ms de ida y vuelta), nunca con datos móviles | Lista física, punto 2 |
| R-06 | Sincronización de fases y relojes | [DEMOSTRADO-SIM] | El servidor manda: plazos con su reloj y la antigüedad medida por el móvil con su reloj monótono. Probado con 5 navegadores y con un reloj de móvil desfasado 1 h (`multiplayer.test`) | Comprobar en la calle que los relojes coinciden (±1 s) |
| R-07 | **Un cliente puede falsear su posición** | [INSPECCIÓN] | El servidor no puede verificar el GPS: acepta lo que envía el móvil. Detecta saltos y velocidades imposibles (más de 12 m/s, tres veces seguidas) **solo como marca** en el Mission Report, sin sanción. «Ubicación simulada» solo se detecta en la app Android. Un fugitivo podría mandar una posición falsa a las pistas | Riesgo asumido entre amigos; antes de jugar con desconocidos, decidir una política (marcas visibles, expulsión) |
| R-08 | **Captura basada en la confirmación del fugitivo** | [INSPECCIÓN] | Sin «Sí, me ha pillado» (o si caduca a los 30 s), no hay captura. Una reclamación falsa no captura sin confirmación, pero una negativa de mala fe bloquea la captura (D-035 sin decidir) | Decidir D-035 |
| R-09 | Acciones simultáneas | [DEMOSTRADO-SIM] | Dos reclamaciones a la vez dan una, y la otra recibe «ya pendiente»; la autodeclaración durante una reclamación da una sola captura; la confirmación tardía o repetida no se duplica; una lectura retrasada se rechaza (`capture-race.test`, 5 pruebas) | — |
| R-10 | Manipulación de mensajes | [DEMOSTRADO-SIM] | Rechazo de mensajes mal formados o grandes, de comandos reservados al servidor, de cambios de rol, de sesiones falsas, de códigos adivinados y de orígenes ajenos; idempotencia y límites de frecuencia (`hostile.test`, 9 pruebas; `tunnel.test`, 4) | — |
| R-11 | **Clave del mapa visible por diseño** | [INSPECCIÓN] | La clave viaja al móvil: cualquiera con la dirección del juego la ve. La dirección del túnel cambia cada vez, así que restringir por origen exige actualizarlo en cada sesión | Clave solo para pruebas, restringida y revocada después |
| R-12 | Una sola máquina y un túnel temporal | [INSPECCIÓN] | El servidor corre en el portátil del organizador. Si se suspende, pierde Internet o el túnel cae (sin garantía de servicio), la partida se para. `STATE_FILE` permite reanudar tras reiniciar el servidor (`persistence.test`, `crash.test`) | Portátil enchufado y sin suspensión (procedimiento `mobile/PRUEBA_REAL_EN_CALLE.md`) |
| R-13 | Batería y datos | [REQUIERE FÍSICO] | Sin medir. El mapa (WebGL, teselas) consume más que el radar; GPS de alta precisión y pantalla siempre encendida | Lista física, punto 8 |
| R-14 | Permisos de ubicación | [DEMOSTRADO-SIM] + [REQUIERE FÍSICO] | Se comprueba el GPS al pulsar «Estoy listo». Sin permiso, o retirado en plena partida, se avisa y se puede reintentar (`web-flow`). Los diálogos reales de Android e iOS, sin probar | Lista física, punto 3 |
| R-15 | iPhone / Safari | [REQUIERE FÍSICO] | Nunca probado; `watchPosition` con el móvil quieto se compensa pidiendo una lectura cada 8 s, pero sin verificar en un iPhone | Incluir un iPhone si lo hay |
| R-16 | Sin radio ni chat | [INSPECCIÓN] | No existe (D-006 frente a D-043, pendiente). La coordinación depende de un canal externo | Acordar el canal antes de jugar |
