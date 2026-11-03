# Arranque de la prueba física

Para el ordenador del organizador (Windows, PowerShell). Procedimiento ampliado y resolución de problemas: `mobile/PRUEBA_REAL_EN_CALLE.md`.

## 1. Qué tiene que estar instalado (una vez)

- **Node.js 22.18 o superior** (comprobado: 24.12). Comprueba con `node --version`.
- **cloudflared**, para el túnel HTTPS temporal. Ya está instalado (2026.10.5). En otro ordenador: `winget install --id Cloudflare.cloudflared`.
- **Dependencias del cliente y bibliotecas del mapa**, en la carpeta del repositorio:
  ```powershell
  cd C:\Users\aange\Projects\Juego-escondite-recuperacion\mobile
  npm install
  npm run vendor
  ```
  `npm run vendor` copia MapLibre a `mobile\www\vendor\` y crea `mobile\www\mapa.config.json` **sin clave**, solo si no existe.

## 2. Clave de MapTiler (para ver calles reales)

**Sin clave, la partida funciona con el radar.** Para el mapa real:

1. En <https://cloud.maptiler.com/>, *Account › API keys › New key*. Crea una clave **solo para esta prueba**.
2. En esa clave, rellena **Allowed HTTP origins**. Pon `http://127.0.0.1:8787` y, el día de la prueba, la dirección del túnel (`https://….trycloudflare.com`), que cambia cada vez.
3. Abre el archivo local, que está fuera de Git:
   ```powershell
   notepad C:\Users\aange\Projects\Juego-escondite-recuperacion\mobile\www\mapa.config.json
   ```
   Sustituye todo su contenido por esto, con tu clave:
   ```json
   { "proveedor": "maptiler", "clave": "PEGA_AQUÍ_TU_CLAVE", "estilo": "dataviz-v4-dark" }
   ```
   **No pegues la clave en el chat, en capturas ni en documentos.**
4. Comprueba que Git no lo ve: `git status --short mobile/www` no debe mostrar `mapa.config.json`.

## 3. Comprobaciones previas (sin arrancar nada)

```powershell
cd C:\Users\aange\Projects\Juego-escondite-recuperacion
.\server\iniciar-servidor.ps1 -SoloComprobar
```

Debe terminar con `Todo correcto. (Solo comprobaciones: no se ha arrancado nada.)`. La línea `Mapa:` dice si faltan la biblioteca o la configuración.

## 4. Arrancar el servidor (ventana 1)

```powershell
cd C:\Users\aange\Projects\Juego-escondite-recuperacion
.\server\iniciar-servidor.ps1
```

- Espera a `SERVIDOR LISTO en http://127.0.0.1:8787`. Escucha **solo en este ordenador**.
- Si el puerto está ocupado: `.\server\iniciar-servidor.ps1 -Puerto 8788`, y usa ese puerto en el túnel.
- El script activa el **registro de diagnóstico** en `%USERPROFILE%\OutrunDiagnostico\`, sin coordenadas ni nombres.
- **El portátil, enchufado y sin suspensión.**

## 5. Abrir el túnel (ventana 2, después de la 1)

```powershell
cloudflared tunnel --url http://127.0.0.1:8787
```

- Si PowerShell no lo encuentra: `& "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://127.0.0.1:8787`.
- Copia la dirección `https://….trycloudflare.com` que aparece. **Cambia cada vez.**
- Si usas el mapa real, añade esa dirección en *Allowed HTTP origins* de la clave (paso 2.2).

## 6. Entrar desde los móviles

1. Con el **wifi apagado** (datos móviles), abre `https://….trycloudflare.com/health`. Debe verse `{"ok":true,…}`.
2. Abre `https://….trycloudflare.com` en el navegador (Chrome en Android, Safari en iPhone).
3. **¿Estamos en el mismo servidor?** Un móvil pulsa «Crear sala». El otro escribe el código de 6 letras y pulsa «Unirme», o abre «Compartir enlace» o «Mostrar QR». Si los dos ven la misma lista de jugadores, están en el mismo servidor. `/health` también muestra `rooms: 1`.

## 7. Comprobar el mapa real y el GPS

- **GPS:** «Estoy listo» pide el permiso de ubicación y comprueba una lectura. Abajo, en la partida, la barra dice «GPS ±N m».
- **¿El mapa es real?** En la huida deben verse **calles con nombres** y la atribución **«© MapTiler © OpenStreetMap contributors»** arriba a la derecha del mapa.
  - Si en su lugar sale un **círculo sobre fondo liso con una cruz** y un mensaje («Mapa sin configurar…», «…ha rechazado la clave…» o «No se pudo cargar la cartografía…»), es el **radar de reserva**: no hay mapa real.
  - El mapa de calles **sintéticas** (rejilla regular) solo existe en las pruebas automáticas, nunca en la app.

## 8. Jugar

1. **Anfitrión:** «Centrar la zona aquí» (en el punto de encuentro), radio, duración, pistas cada… y la lista de seguridad.
2. **Todos:** «Estoy listo». **Anfitrión:** «Empezar partida».
3. Durante la persecución, la acción de cada rol está **abajo, fija**: «¿Has pillado a alguien? Pulsa su nombre» para el cazador, «Me han pillado» para el fugitivo.

## 9. Detener de forma segura

1. **Terminar la partida:** el anfitrión pulsa dos veces «Terminar partida (anfitrión)». Cualquiera puede pulsar dos veces «Abandonar la partida».
2. **Ventana 2 (túnel): Ctrl+C.** La dirección deja de existir.
3. **Ventana 1 (servidor): Ctrl+C.** Se genera el informe de diagnóstico `.md` en `%USERPROFILE%\OutrunDiagnostico\`.
4. Comprueba que todo está cerrado:
   ```powershell
   Get-Process cloudflared -ErrorAction SilentlyContinue
   Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
   ```
   Ninguno de los dos debe mostrar nada.
5. **Revoca la clave de MapTiler** de la prueba en su panel. Eso lo haces tú.

## 10. Si algo falla

| Síntoma | Qué hacer |
|---|---|
| El túnel se cae (los móviles: «Sin conexión con el servidor…») | Ctrl+C en la ventana 2 y vuelve a abrir el túnel. **La dirección será otra:** los móviles deben abrir la nueva y entrar de nuevo con el código. Si usas el mapa, añade la nueva dirección en MapTiler |
| El servidor se cierra | Ventana 1: `.\server\iniciar-servidor.ps1`. Sin `-ArchivoEstado`, las salas se pierden: hay que crear otra. Con `-ArchivoEstado outrun-estado.json` se recuperan, pero ese archivo guarda los nombres y el centro de la zona: bórralo al terminar |
| `/health` no carga en el móvil | ¿Ventana 2 abierta? ¿Dirección bien copiada? ¿Wifi apagado y datos encendidos? |
| El mapa no carga | Lee el mensaje bajo el radar: clave, dirección permitida o cobertura. «Reintentar el mapa» lo intenta de nuevo. **La partida sigue con el radar** |
| GPS «Lectura antigua» o «Sin señal» | Al aire libre; pantalla encendida; permiso de ubicación del navegador. Si tras recuperar la cobertura no se renueva en 1 min, **anota la hora** (riesgo R-03) |
