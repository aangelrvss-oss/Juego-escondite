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
   - En el ordenador, `health-watch` debe seguir contando lecturas de los dos (al menos una cada 10 s).
   - Después, A se acerca, toca suavemente a B y pulsa su nombre.
   - **Anota si la reclamación llega a B** o si A ve «No hay una ubicación reciente del fugitivo» o «La ubicación del fugitivo aún no es estable».
4. B responde **No** la primera vez (la partida sigue) y **Sí, me ha pillado** la segunda.
   - El Mission Report debe salir igual en los dos.

### 5. Recuperación (con una segunda partida: «Revancha»)

1. En plena persecución, **B recarga la página**. Debe volver a la partida sin repetir la tarjeta del rol ni los avisos antiguos.
2. **A activa el modo avión** 30 s y lo quita. Arriba debe salir el aviso de conexión perdida y luego desaparecer.
   - Comprobad que el tiempo restante sigue igual que en B.
3. **B retira el permiso de ubicación** en los ajustes del navegador. Debe salir el aviso fijo «Falta el permiso de ubicación», y el indicador debe dejar de decir que se comparte.
   - Al devolverlo y pulsar **Reintentar**, vuelve a compartir.
4. **A** pulsa **Abandonar la partida** (dos toques). Debe volver al inicio, y el indicador debe dejar de decir que comparte.

### 6. Cerrar

1. Ctrl+C en el servidor y en el túnel. **Cierra el túnel en cuanto termines.**
2. Borra `outrun-estado.json` si lo usaste.

## Criterios

| Pregunta | Se cumple si… |
|---|---|
| Partida completa | Entrar, jugar, capturar y ver el mismo Mission Report en los dos sin ayuda del ordenador |
| QR | La cámara del sistema abre el enlace con el código puesto |
| Pantalla encendida | No se apaga sola durante la partida (o el aviso lo dice claramente) |
| Jugador quieto | La reclamación sobre un fugitivo que lleva 2–3 min quieto llega y se puede confirmar |
| Recuperación | Recargar, modo avión y retirar el permiso no rompen la partida ni repiten avisos antiguos |

## Qué enviar después

- La tabla de criterios con «sí», «no» o «no probado», más el modelo de móvil y el navegador.
- La salida de `health-watch` (solo contadores).
- Capturas de pantalla de lo que haya fallado. **No envíes capturas con tu ubicación** (el radar o un mapa).
