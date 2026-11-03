# Prueba real en la calle: dos móviles, datos móviles y GPS real

> **Estado (27/10/2026): preparada, NO realizada con móviles.** El túnel real sí se ha comprobado desde el ordenador (`cloudflared` 2026.10.5, instalado con tu autorización), con dos clientes del juego a través de la dirección pública: página, `/health`, WebSocket seguro, sala, fases, roles privados y el mismo resultado final en los dos. Una web ajena recibe 403. Después se cerró el túnel (la dirección devolvía 530). Nada de esto sustituye a la prueba con móviles. Lo comprobado en el ordenador está marcado con ✅; lo que necesita tu autorización, con 🔒.
>
> Sustituye a `PRUEBA_PARTIDA_NAVEGADOR.md`. Para la variante con la app Android (pantalla bloqueada), ver `PRUEBA_PARTIDA_ANDROID.md`.

**Cómo funciona:** el servidor corre en tu ordenador y solo escucha en el propio ordenador (127.0.0.1). Un túnel HTTPS temporal (`cloudflared`) sale desde el ordenador hacia Cloudflare y da una dirección `https://<algo>.trycloudflare.com`. Los móviles abren esa dirección con sus datos móviles. La página, el WebSocket (`/ws`) y el estado (`/health`) van por esa misma dirección. No se abre ningún puerto del router y no hay que instalar nada en los móviles.

---

## 1. Qué vamos a probar

La puerta de salida de la Fase 2 del Plan Maestro: **dos partidas consecutivas completas**, sin reiniciar el servidor, sin contradicciones entre los dos móviles, con GPS real y cada móvil con sus propios datos.

Además, cinco riesgos que solo se ven en la calle:
1. Si el navegador mantiene la pantalla encendida durante la partida (sin ella, deja de enviar la ubicación).
2. Si la posición de un jugador **quieto** sigue siendo reciente (si no, no se le puede capturar).
3. Si la captura con GPS real funciona con las tolerancias actuales (lecturas de ≤ 15 s y precisión de ≤ 30 m; son hipótesis).
4. Si la partida se recupera tras perder la cobertura un momento.
5. Si el QR de la sala se lee con la cámara del sistema (nunca se ha comprobado).

**Esto no es una prueba de diversión.** Para eso está `docs/product/PROTOCOLO_SESIONES_JUGADORES.md`, con 4 o más personas.

## 2. Qué necesitamos antes de empezar

| Qué | Detalle |
|---|---|
| 🔒 Autorización | Para instalar `cloudflared` y abrir el túnel durante la prueba. **Mientras esté abierto, cualquiera con la dirección puede abrir la página** (ver §14 bis) |
| Ordenador | Este Windows, enchufado, sin suspensión, con Internet y con el repositorio. ✅ Node 24.12 instalado |
| Dos móviles | Con batería de más del 70 % y datos móviles (sin wifi). Android con Chrome actualizado, o iPhone con Safari en iOS 16.4 o superior (antes no hay forma de mantener la pantalla encendida) |
| Dos personas | Adultas (D-008). Una cazadora y una fugitiva |
| Zona | Exterior, conocida y segura: un parque o una plaza peatonal, sin calzadas que cruzar ni propiedades privadas. De día |
| Tiempo | Unos 45 minutos: 10 de preparación y dos partidas de unos 15 minutos |

Configura el ordenador para que **no se suspenda** mientras dure la prueba (Configuración › Sistema › Inicio/apagado y suspensión). Si se suspende, el túnel y el servidor se paran.

## 3. Qué debe prepararse en el ordenador (una sola vez)

1. ✅ **Instalar `cloudflared`. Hecho el 27/10/2026** (versión 2026.10.5, en `C:\Program Files (x86)\cloudflared\`). Solo hace falta repetirlo en otro ordenador. En PowerShell:
   ```powershell
   winget install --id Cloudflare.cloudflared
   ```
   Cierra y vuelve a abrir PowerShell, y comprueba que existe con `cloudflared --version`.
   - Es la herramienta oficial de Cloudflare. El «túnel rápido» **no pide cuenta, ni claves, ni tokens**, y la dirección cambia cada vez.
   - Cloudflare lo presenta como una herramienta para pruebas, sin garantía de disponibilidad.
2. ✅ **Comprobar que todo está listo**, desde la carpeta del repositorio:
   ```powershell
   cd C:\Users\aange\Projects\Juego-escondite-recuperacion
   .\server\iniciar-servidor.ps1 -SoloComprobar
   ```
   Debe terminar con `Todo correcto. (Solo comprobaciones: no se ha arrancado nada.)`.
3. **(Opcional) Mapa con calles.** Sin esto, la partida usa el radar de siempre, que funciona igual. Pasos (detalle en `mobile/MAPA.md`):
   1. En `mobile\`, ejecuta `npm install` y `npm run vendor`.
   2. Consigue una clave de MapTiler.
   3. Copia `mobile\mapa.config.ejemplo.json` a `mobile\www\mapa.config.json` y escribe la clave.

   La comprobación del paso 2 dice si falta algo («[--] Mapa: …»). **Pruébalo antes de salir:** abre una partida en el ordenador y mira que en la huida aparecen calles. Si sale «Se muestra el radar», lee el motivo en pantalla.

## 4. Cómo iniciar el servidor

✅ En una ventana de PowerShell (la llamaremos **ventana 1**):
```powershell
cd C:\Users\aange\Projects\Juego-escondite-recuperacion
.\server\iniciar-servidor.ps1
```
Qué debe aparecer, en este orden:
- las comprobaciones con `[ok]`;
- `THE OUTRUN escuchando en http://127.0.0.1:8787 (WebSocket en /ws, estado en /health)`;
- `SERVIDOR LISTO en http://127.0.0.1:8787  (/health: ok, salas: 0)`.

**Comprobación:** abre `http://127.0.0.1:8787/health` en el navegador del ordenador. Debe verse `{"ok":true,"rooms":0,…}`.

El script arranca el servidor **solo en este ordenador** y con `TRUST_PROXY=1`, para que el límite de intentos se aplique a la IP real de cada móvil y no a la del túnel. En disco solo guarda el **registro de diagnóstico** de la prueba, sin coordenadas, nombres, códigos de sala ni IP (ver §12 bis). Desactívalo con `-SinDiagnostico`. Si quieres que las salas sobrevivan a un reinicio del servidor, añade `-ArchivoEstado outrun-estado.json`. Ese archivo guarda los nombres y el centro de la zona (que es tu posición al pulsar «Centrar la zona aquí»): bórralo al terminar.

**Si el puerto está ocupado**, el script lo dice y no arranca. No cierra ningún programa. Si es un servidor anterior de THE OUTRUN, ciérralo con Ctrl+C en su ventana. Si no, usa otro puerto (`.\server\iniciar-servidor.ps1 -Puerto 8788`) y usa ese mismo puerto en el túnel.

## 5. Cómo autorizar y abrir el túnel HTTPS

🔒 Solo después de autorizarlo. En **otra** ventana de PowerShell (**ventana 2**):
```powershell
cloudflared tunnel --url http://127.0.0.1:8787
```
- Usa `127.0.0.1` y no `localhost`: en Windows, `localhost` puede ir primero a la dirección IPv6, y el servidor solo escucha en IPv4.
- Al cabo de unos segundos aparece un recuadro con una dirección `https://<palabras-al-azar>.trycloudflare.com`. **Esa es la dirección de hoy:** cambia cada vez que abras el túnel. No la guardes ni la publiques.
- Deja las dos ventanas abiertas durante toda la prueba.

## 6. Cómo obtener y compartir el enlace

1. Copia la dirección `https://….trycloudflare.com` de la ventana 2.
2. **Comprobación desde fuera:** en el móvil A, con el **wifi apagado**, abre `https://….trycloudflare.com/health`. Debe verse `{"ok":true,…}`. Si no carga, el problema es el túnel o la red, no el juego: ver §14.
3. Pásale la dirección al móvil A por el canal que uséis (WhatsApp, por ejemplo). Al móvil B se la pasará el juego con el QR o el enlace de la sala.

## 7. Cómo conectar los dos móviles

**Móvil A (anfitrión):**
1. Abre `https://….trycloudflare.com`. Debe verse la portada con «RUN. HIDE. STAY AHEAD.».
2. La primera vez, marca **«Tengo 18 años o más. THE OUTRUN es solo para adultos.»**
3. Escribe tu nombre y pulsa **Crear sala**. Aparece el código de 6 caracteres y el indicador de arriba dice **Conectado**.
4. Pulsa **Mostrar QR**.

**Móvil B:**
1. Escanea el QR **con la cámara del sistema** (no con una app). **Anota si la cámara reconoce el enlace.**
2. Se abre la web con «Te han invitado a la sala XXXXXX». Marca la casilla de edad, escribe tu nombre y pulsa **Unirme**.
3. Si el QR no funciona: en A, pulsa **Compartir enlace** y envíalo, o escribe el código a mano en B y pulsa **Unirme**.

**Comprobación:** los dos ven la misma lista de jugadores, con el mismo código. En la ventana 1 no debe salir ningún error.

## 8. Cómo comprobar el GPS

1. **Los dos:** pulsad **Estoy listo**. El botón dice «Comprobando tu GPS…» y el navegador pide permiso de ubicación: **permitir**. En iPhone, si no lo pide, revisa Ajustes › Privacidad › Localización › Safari.
   - Si se deniega, no se puede estar listo, y el aviso lo explica.
2. **A:** colócate en el punto de encuentro y pulsa **Centrar la zona aquí**. Elige:
   - radio de **200 o 300 m** (que quepa en la zona segura);
   - **Persecución 10 min**, **Huida 2 min** y **Pistas cada 2 min**.
3. **A:** marca la casilla **«Lista de seguridad revisada…»**. Léela en voz alta.
4. **A:** en los desplegables de los jugadores, pon a A como **Cazador** y a B como **Fugitivo** (o deja «Sorteo»).
5. **Comprobación:** en B, la tarjeta «Partida» dice «Todo listo: el anfitrión puede empezar.». En A, el botón **Empezar partida** está activo.
6. **Si es de noche**, aparece el aviso «Es de noche…». Esta prueba debe hacerse de día.

## 9. Cómo jugar la primera partida

1. **A** pulsa **Empezar partida**.
   - En los dos aparece «La partida empieza en» con una cuenta atrás de 5 s, que debe acabar a la vez (±1 s).
   - Después, cada uno ve **solo su rol** («Tu rol») con «Captura: toque suave, nunca en la calzada».
2. **Huida (2 min):** B se aleja caminando dentro de la zona. A espera en el punto de encuentro.
   - **Pantalla:** bajo el indicador debe decir «La pantalla se mantiene encendida durante la partida…». Si dice «Mantén la pantalla encendida…», el navegador no lo permite: anota el modelo y el navegador.
   - **Ubicación:** la barra de GPS de cada uno debe decir «GPS ±N m», no «Lectura antigua» ni «Sin señal». Anota N.
3. **Persecución:** el fugitivo se esconde y **se queda quieto 2–3 minutos**.
   - **Comprobación por jugador:** cuando a A le llegue la siguiente pista, en **«Última pista»** B debe aparecer con «hace N s», un número pequeño (menos de 15), y **sin** «imprecisa o antigua». Anota N. Es la prueba de que un jugador quieto no caduca.
4. **Captura:** A camina hasta B (sin correr, sin mirar el móvil mientras se mueve) y le toca suavemente.
   - Ya **parado**, A pulsa el nombre de B en la sección de captura.
   - En B aparece «¿Te ha pillado A?». B pulsa **No** la primera vez: la partida sigue y A ve «Captura rechazada».
   - Esperad 5 s. A vuelve a pulsar el nombre de B y B pulsa **Sí, me ha pillado**.
   - Si la reclamación se rechaza, anota el mensaje exacto. Por ejemplo: «No hay una ubicación reciente del fugitivo: no se puede validar.», «La ubicación del fugitivo aún no es estable…» o «Tu GPS acaba de dar un salto…».
   - Si no se consigue tras 3 intentos, B pulsa **Me han pillado** y elige a A. Anótalo: es un fallo de la captura por GPS.
5. **Final:** los dos ven el **Mission Report** con «Ganan los cazadores». **Comparad los dos textos:** tienen que ser iguales.

## 10. Cómo realizar la segunda partida

**Sin reiniciar el servidor y sin cerrar el túnel.**
1. **A** pulsa **Revancha**. **B** pulsa **Unirme a la revancha**.
2. Los dos pulsáis **Estoy listo**. La configuración de la primera partida se conserva; si hace falta, A puede volver a centrar la zona.
3. Si queréis, cambiad los roles en los desplegables.
4. **A** pulsa **Empezar partida** y jugad como en §9, con una prueba de recuperación en mitad de la persecución:
   - **Recarga:** B recarga la página. Debe volver a la partida sin volver a entrar con el código y sin repetir la tarjeta del rol.
   - **Cobertura (solo si estáis parados y en un sitio seguro):** A activa el modo avión 60 s y lo quita. Arriba debería salir «Sin conexión con el servidor. La partida sigue…». Detectar el corte puede tardar hasta unos 40 s, así que si no sale, anótalo, pero no es un fallo. Al volver, el aviso desaparece y **el tiempo restante debe ser igual en los dos**.
5. Terminad con una captura o dejad que se acabe el tiempo. **Comparad los dos Mission Report.**
6. **Comprobación de estado residual:** el segundo informe solo debe tener las capturas de la segunda partida, y la lista de «Capturas» debe empezar en 0 al comenzarla.

**No pulséis «Abandonar la partida» ni «Terminar partida (anfitrión)» en estas dos partidas:** terminan sin ganador y no cuentan para la puerta de salida.

## 11. Cómo detener el túnel

En la **ventana 2**, pulsa **Ctrl+C**. Debe volver el símbolo del sistema.

## 12. Cómo detener el servidor

En la **ventana 1**, pulsa **Ctrl+C**. Debe aparecer «Servidor detenido.». Si arrancaste con `-ArchivoEstado`, borra el archivo:
```powershell
Remove-Item .\outrun-estado.json
```

### 12 bis. Registro de diagnóstico: qué se guarda y cómo exportarlo

Mientras el servidor está en marcha, escribe en `%USERPROFILE%\OutrunDiagnostico\diagnostico-<fecha>-<hora>.jsonl` una línea por hecho. Al detenerlo con Ctrl+C, el script genera al lado el informe `diagnostico-<fecha>-<hora>.md`, que se lee en cualquier editor. No hace falta Internet ni Claude.

**Qué recoge** (comprobado en `server/test/diagnostics.test.mjs`):
- conexiones abiertas y cerradas, con el motivo del cierre: el móvil cerró, la red se cortó, 75 s sin datos del móvil, sesión abierta en otra conexión…;
- creación de la sala, entradas y reanudaciones, y si se reenviaron los eventos perdidos o solo el estado;
- cada cambio de fase, también los automáticos, con quién estaba conectado en ese momento;
- cada comando con su resultado: listo, empezar, reclamar, confirmar, revancha…; los rechazados, con el motivo;
- los eventos del juego: roles, reclamaciones y su resultado (confirmada, rechazada, caducada), capturas, pistas, salidas de la zona, final con el ganador y la causa, y revancha;
- cada 30 s y en cada cambio de fase, un **resumen del GPS de cada jugador**: lecturas aceptadas por canal (página o app), las ignoradas y su motivo, el mayor hueco sin lecturas, la precisión y la antigüedad;
- errores internos del servidor (solo el tipo y la línea del código) y errores enviados a los móviles.

**Qué no recoge:**
- coordenadas, nombres, códigos de sala, IP ni secretos. Los jugadores aparecen como J1, J2… por orden de entrada (J1 crea la sala), y las salas como S1, S2…;
- **apunta en papel qué persona era cada J** (por el orden en que entrasteis): el registro no puede saberlo;
- nada de lo que solo ocurre en el móvil: avisos en pantalla, errores del GPS del teléfono antes de enviar, qué fase mostraba cada pantalla o la batería. Eso sigue saliendo de la tabla del §15 y de vuestras notas.

**Exportar después de jugar:**
1. Detén el servidor (§12). Si el informe no aparece, genéralo a mano:
   ```powershell
   node server\informe-diagnostico.mjs "$env:USERPROFILE\OutrunDiagnostico\diagnostico-<fecha>-<hora>.jsonl"
   ```
2. Copia la carpeta para guardarla o compartirla:
   ```powershell
   explorer "$env:USERPROFILE\OutrunDiagnostico"
   ```
   El `.md` es el informe para leer y el `.jsonl`, el registro completo. Revísalos antes de enviarlos a alguien: no llevan datos personales, pero sí las horas de la prueba.

La carpeta está fuera del repositorio y fuera de OneDrive, a propósito. Si el servidor se reinicia, sigue escribiendo en un archivo nuevo, y los alias J empiezan otra vez.

## 13. Cómo verificar que el acceso público ha quedado cerrado

En PowerShell:
```powershell
Get-Process cloudflared -ErrorAction SilentlyContinue        # no debe mostrar nada
Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue   # no debe mostrar nada
```
Y desde un móvil, abre otra vez `https://….trycloudflare.com/health`: debe dar un error de Cloudflare o no cargar. La dirección de hoy deja de existir para siempre.

## 14. Qué hacer si algo falla

Antes de cambiar nada, **anota la hora, el móvil y el navegador, y copia el mensaje exacto**.

| Síntoma | Qué comprobar | Qué recoger |
|---|---|---|
| El servidor no arranca | Lee la línea `[!!]` del script. ¿Node 22.18 o superior? ¿Estás en la carpeta del repositorio? | La salida completa de la ventana 1 |
| El puerto está ocupado | El script dice qué programa lo usa. No lo cierres si no sabes qué es: usa `-Puerto 8788`, también en el túnel | El nombre del programa y el PID que muestra |
| El túnel no se inicia | ¿`cloudflared --version` funciona? ¿Hay Internet? Si dice que no admite túneles rápidos con configuración, mira si existe `%USERPROFILE%\.cloudflared\config.yml` (no lo borres sin saber de dónde viene) | La salida de la ventana 2 |
| La página no carga en el móvil | ¿`/health` responde desde el móvil con el wifi apagado? ¿Sigue abierta la ventana 2? ¿Has copiado bien la dirección? | Captura del error del navegador |
| HTTPS funciona, pero falla la conexión en tiempo real (el indicador no pasa a «Conectado») | Abre la dirección del túnel exactamente, sin cambiar el nombre. El servidor solo acepta la página servida desde esa misma dirección. ¿Hay errores en la ventana 1? | Texto del indicador y salida de la ventana 1 |
| El segundo jugador no puede entrar | «No existe ninguna sala…»: ¿el código es el último (no se pulsó «Cambiar el código»)? «Demasiados intentos»: ¿el servidor se arrancó con el script (lleva `TRUST_PROXY=1`)? La partida ya empezada no admite a nadie | Mensaje exacto |
| El navegador no pide ubicación | ¿La dirección empieza por `https://`? Revisa los permisos del sitio. En iPhone: Ajustes › Privacidad › Localización › Safari | Navegador y versión |
| El GPS no se actualiza («Lectura antigua» o «Sin señal») | Al aire libre, lejos de edificios altos. ¿La pantalla sigue encendida? ¿Sale «Falta el permiso de ubicación»? Entonces pulsa «Reintentar» tras activarlo | La barra de GPS y la antigüedad en «Última pista» |
| El juego indica que un jugador está desconectado | Mira el indicador de ese móvil. Si dice «Reconectando…» más de 1 min con cobertura, recarga la página: debe volver solo | Hora y si hubo cambio de red |
| El teléfono suspende la actividad al bloquearse | **Esperado en el navegador:** con la pantalla apagada no hay ubicación. No bloquees el móvil durante la partida. Si la pantalla se apaga sola, anota si salía «Mantén la pantalla encendida» | Modelo, navegador y ahorro de batería |
| La segunda partida no puede iniciarse | Lee «Para empezar falta» (zona, lista de seguridad, jugadores sin conexión o sin «listo»). Si la revancha no aparece: ¿han pasado más de 30 min desde el final? | Texto de «Para empezar falta» |
| Los dos móviles ven resultados distintos | **Fallo crítico** para la puerta de salida | Capturas de los dos Mission Report (sin el radar) |

### 14 bis. Seguridad mientras el túnel está abierto
- **Quién puede entrar:** cualquiera con la dirección puede abrir la página y crear salas (como mucho 5 por IP y 100 en total), pero no entrar en la vuestra sin el código. Los códigos tienen 6 caracteres, los fallos al entrar se limitan a 20 por minuto y por IP, y no se puede entrar a una partida empezada.
- **Lo que no se puede hacer** sin la sesión del jugador: controlar una partida, cambiar el rol o enviar la ubicación de otro.
- **Qué se publica:** no hay paneles de administración ni de depuración. `/health` solo da contadores (salas, conexiones, lecturas), sin códigos, nombres ni ubicaciones (comprobado en `server/test/tunnel.test.mjs`).
- **Cifrado:** HTTPS cifra el tráfico entre el móvil y Cloudflare, y el túnel, entre Cloudflare y tu ordenador. **Cloudflare descifra en medio**, así que técnicamente puede ver lo que pasa, ubicaciones incluidas. Es aceptable para una prueba entre conocidos que lo saben. Para algo más, decide el alojamiento (D-007 y D-014).
- **Conservación:** las lecturas de ubicación viven en la memoria del servidor y se borran al terminar cada partida. Las salas se borran solas (60 s tras cerrarse, o 30 min después del final si nadie pide revancha). Al detener el servidor solo queda el registro de diagnóstico (§12 bis, sin ubicaciones ni nombres), y el archivo de estado si usaste `-ArchivoEstado`. El registro de operaciones de la consola está apagado por defecto y tampoco contiene ubicaciones.
- **No compartas** la dirección del túnel fuera del grupo, ni capturas del radar con lugares reconocibles.
- **Cierra el túnel** en cuanto terminéis (§11 y §13).

## 15. Qué información debemos registrar al terminar

Rellenad esta tabla («sí», «no» o «no probado») y enviadla con el modelo de cada móvil, el navegador y su versión:

| # | Comprobación | Resultado | Notas |
|---|---|---|---|
| 1 | `/health` responde desde el móvil con datos móviles | | |
| 2 | El QR se lee con la cámara del sistema | | |
| 3 | Los dos ven la misma sala y el mismo estado | | |
| 4 | El permiso de ubicación se pide y la barra dice «GPS ±N m» | | N = |
| 5 | Cuenta atrás y fases a la vez (±1 s); cada uno solo ve su rol | | |
| 6 | La pantalla se mantiene encendida durante la partida | | |
| 7 | B quieto 2–3 min: «Última pista» muestra «hace N s» con N < 15 | | N = |
| 8 | La captura por reclamación funciona con GPS real | | Intentos y mensajes |
| 9 | Partida 1: el Mission Report es igual en los dos | | |
| 10 | Partida 2 sin reiniciar el servidor; sin restos de la partida 1 | | |
| 11 | Recarga en plena partida: vuelve sin repetir avisos | | |
| 12 | Modo avión 60 s: recuperación con el mismo tiempo | | Si salió el aviso |
| 13 | Partida 2: el Mission Report es igual en los dos | | |
| 14 | Túnel cerrado y servidor detenido (§13) | | |

Añadid también:
- la batería al empezar y al terminar;
- cualquier error de la ventana 1;
- las horas de cada problema;
- qué persona era cada J1, J2… (orden de entrada en la sala), en papel y fuera del repositorio;
- el informe `diagnostico-….md` del §12 bis.

**No guardéis ni enviéis** capturas con ubicaciones, ni la dirección del túnel.

**Criterio de la puerta de salida:** las comprobaciones 3, 5, 9, 10 y 13 en «sí», con GPS real y datos móviles. Si una partida no se puede completar, anotad el paso exacto: **la fase no está superada**. Con dos móviles es una primera señal; después hay que repetirla con 4 o más personas.
