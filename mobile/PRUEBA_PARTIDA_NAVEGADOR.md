# Prueba real de partida con dos móviles desde el navegador

> **Estado (26/10/2026): preparada, NO realizada.** No hay ningún resultado físico. Todo lo que se describe aquí está probado solo de forma automática y en Chrome de escritorio con emulación móvil (`QUALITY_STATE.md`). Es la alternativa a `PRUEBA_PARTIDA_ANDROID.md` que no necesita instalar ninguna APK: sirve para cualquier móvil, iPhone incluido.

**Requiere tu autorización antes de hacerla:** publicar el servidor con un túnel HTTPS (o abrirlo a la red local). Los navegadores solo dan la ubicación a páginas seguras (`https://`), así que una red local con `http://` **no sirve**.

## Qué se quiere saber

1. Si dos personas pueden jugar una partida completa desde el navegador de su móvil: entrar por el enlace o el QR, comprobar el GPS, jugar, capturar y ver el Mission Report.
2. Si la pantalla se mantiene encendida durante la partida (sin ella, el navegador deja de enviar la ubicación).
3. Si la posición de un jugador **quieto** sigue siendo actual (el riesgo es que un fugitivo escondido no se pueda capturar).
4. Si la partida se recupera al recargar la página o al perder la conexión.

## Qué necesitas

| Cosa | Detalle |
|---|---|
| Ordenador | Node 22.18 o superior y este repositorio. Encendido, sin suspenderse y con Internet toda la prueba |
| Túnel HTTPS | Por ejemplo, `cloudflared`, instalado por ti desde la web oficial. **Mientras esté abierto, tu servidor es accesible desde Internet** |
| Móvil A y móvil B | Cualquier móvil con un navegador actual (Chrome en Android; Safari en iPhone, iOS 16.4 o superior para mantener la pantalla encendida). Con datos móviles o wifi, da igual |
| Opcional | Un tercer jugador en el navegador del ordenador, para que haya un equipo con dos |

## Procedimiento

### 1. Servidor y túnel (en el ordenador)

```bash
TRUST_PROXY=1 STATE_FILE=outrun-estado.json node server/main.ts   # terminal 1
cloudflared tunnel --url http://localhost:8787                     # terminal 2: anota la dirección https://…
node server/health-watch.mjs                                       # terminal 3: contadores cada 10 s (sin datos personales)
```

En Windows (PowerShell), el terminal 1 es así:
```powershell
$env:TRUST_PROXY="1"; $env:STATE_FILE="outrun-estado.json"; node server/main.ts
```
y el túnel, `cloudflared.exe tunnel --url http://localhost:8787`.

**Comprobación antes de seguir:** abre `https://…/health` en el navegador del móvil A, con datos móviles y sin wifi. Debe responder `{"ok":true,…}`. Si no responde, el problema es el túnel o la red, no el juego: anótalo y para.

`STATE_FILE` es opcional: guarda las salas (sin coordenadas ni secretos) por si el servidor se reinicia. Borra el archivo al terminar.

### 2. Entrar

1. **Móvil A:** abre la dirección `https://…`.
   - Marca «Tengo 18 años o más» (solo la primera vez), escribe tu nombre y pulsa **Crear sala**.
   - Pulsa **Mostrar QR**.
2. **Móvil B:** escanea el QR **con la cámara del sistema**.
   - Anota si la cámara reconoce el enlace (es la primera vez que se escanea con un lector real).
   - Debe abrirse la web con el código ya puesto. Marca la edad, escribe tu nombre y pulsa **Unirme**.
3. Si el QR falla, usa **Compartir enlace** o escribe el código a mano, y anótalo.

### 3. Preparar

1. **A:** colócate en el punto de encuentro y pulsa **Centrar la zona aquí**.
   - Elige 10 min de persecución, 2 min de huida y pistas cada 3 min.
   - Marca la lista de seguridad y pon a A como cazador y a B como fugitivo.
2. **Los dos:** pulsad **Estoy listo**. El navegador pedirá permiso de ubicación: concédelo.
   - Anota si alguno no consigue posición.
3. **Si es de noche**, comprueba que aparece el aviso de juego nocturno.

### 4. Partida

1. **A** pulsa **Empezar partida**. Comprobad:
   - la cuenta atrás de 5 s es igual en los dos;
   - cada uno ve **solo su rol**, con las normas de captura.
2. **Pantalla encendida:** bajo el indicador de ubicación debe decir «La pantalla se mantiene encendida durante la partida».
   - No toquéis el móvil durante 2 minutos. **Anota si la pantalla se apaga.**
   - Si sale «Mantén la pantalla encendida», el navegador no lo permite: anota cuál es.
3. **Quieto (lo más importante):** B se esconde y **no se mueve** durante 2–3 minutos.
   - En el ordenador, `lecturas_ws` de `health-watch` debe seguir subiendo. Ojo: es el total de los dos, no distingue jugadores.
   - **La comprobación por jugador la hace A:** cuando llegue la siguiente pista (cada 3 min), en «Última pista» B debe aparecer con «hace N s», un número pequeño (menos de 15 s), y **sin** «imprecisa o antigua». Anota N.
   - Después, A se acerca, toca suavemente a B y pulsa su nombre.
   - **Anota si la reclamación llega a B** o si A ve «No hay una ubicación reciente del fugitivo» o «La ubicación del fugitivo aún no es estable».
4. B responde **No** la primera vez (la partida sigue) y **Sí, me ha pillado** la segunda.
   - El Mission Report debe salir igual en los dos.

### 5. Segunda partida consecutiva, con recuperación («Revancha»)

La puerta de salida de la Fase 2 del Plan Maestro es «dos partidas consecutivas completas con resultados correctos, sin reiniciar manualmente el backend y sin contradicciones entre dispositivos». Esta segunda partida **tiene que terminar con normalidad** (por captura o por tiempo), aunque incluya los cortes de abajo. **No reiniciéis el servidor entre las dos.**

1. En plena persecución, **B recarga la página**. Debe volver a la partida sin repetir la tarjeta del rol ni los avisos antiguos.
2. **A activa el modo avión** 30 s y lo quita. Arriba debe salir el aviso de conexión perdida y luego desaparecer.
   - Comprobad que el tiempo restante sigue igual que en B.
3. **B retira el permiso de ubicación** en los ajustes del navegador. Debe salir el aviso fijo «Falta el permiso de ubicación», y el indicador debe dejar de decir que se comparte.
   - Al devolverlo y pulsar **Reintentar**, vuelve a compartir.
4. Terminad la partida: B se declara capturado o se agota el tiempo. El Mission Report debe salir igual en los dos.

### 5b. Abandono (después, en una tercera partida opcional)
**A** pulsa **Abandonar la partida** (dos toques). Debe volver al inicio, y el indicador debe dejar de decir que comparte. Si A era el único cazador, la partida termina sin ganador: por eso va aparte y no cuenta para la puerta de salida.

### 6. Cerrar

1. Ctrl+C en el servidor y en el túnel. **Cierra el túnel en cuanto termines.**
2. Borra `outrun-estado.json` si lo usaste.

## Criterios

| Pregunta | Se cumple si… |
|---|---|
| Partida completa | Entrar, jugar, capturar y ver el mismo Mission Report en los dos sin ayuda del ordenador |
| **Puerta de la Fase 2 (Plan Maestro)** | Las partidas 1 y 2 son consecutivas y completas, con el mismo resultado en los dos móviles, sin reiniciar el servidor. Una sola prueba con dos personas es una primera señal, no la validación del juego (guía de criterio §8). Faltará repetirla con más jugadores y con personas ajenas al desarrollo (guía §9) |
| QR | La cámara del sistema abre el enlace con el código puesto |
| Pantalla encendida | No se apaga sola durante la partida (o el aviso lo dice claramente) |
| Jugador quieto | La reclamación sobre un fugitivo que lleva 2–3 min quieto llega y se puede confirmar |
| Recuperación | Recargar, modo avión y retirar el permiso no rompen la partida ni repiten avisos antiguos |

## Si algo falla

| Síntoma | Qué mirar |
|---|---|
| `/health` no responde desde el móvil | El túnel o la red. No es un fallo del juego |
| El navegador no pide permiso de ubicación o la niega siempre | La dirección tiene que empezar por `https://`. Revisa los permisos del sitio en el navegador |
| «Falta el permiso de ubicación» fijo | El permiso está retirado. Actívalo en los ajustes del navegador y pulsa «Reintentar» |
| La pantalla se apaga sola | Mira si aparece «Mantén la pantalla encendida»: el navegador no permite mantenerla encendida (por ejemplo, un iPhone con iOS anterior al 16.4 o en modo de ahorro). Anota el modelo y el navegador |
| B quieto aparece en «Última pista» con «imprecisa o antigua» | Su navegador no está dando lecturas nuevas. Anota el modelo y el navegador y si la pantalla seguía encendida. Es justo lo que se quiere averiguar |
| La reclamación da «Tu GPS acaba de dar un salto» o «aún no es estable» | Filtro de saltos (D-049): esperad 5–10 s y repetid. Anota cuántas veces pasa |
| «Demasiados intentos» al unirse | El servidor no se arrancó con `TRUST_PROXY=1`: todos los móviles comparten la IP del túnel |
| Un móvil se queda en «Reconectando…» más de 1 min con cobertura | Recarga la página: debe volver a la partida sin volver a entrar con el código. Anota la hora |
| Los dos móviles ven resultados distintos | **Fallo crítico** para la puerta de la Fase 2. Haz capturas de los dos Mission Report, sin el radar |

## Qué enviar después

- La tabla de criterios con «sí», «no» o «no probado», más el modelo de móvil y el navegador.
- La salida de `health-watch` (solo contadores).
- Capturas de pantalla de lo que haya fallado. **No envíes capturas con tu ubicación** (el radar o un mapa).
