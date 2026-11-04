# Protocolo de prueba física con móviles: https://the-outrun.onrender.com

Objetivo: comprobar con **móviles reales** lo que las pruebas automáticas no pueden comprobar: GPS real, pantalla bloqueada, segundo plano, cambios de red y la app instalada. **Nada de esta lista se ha hecho todavía.** Anotad el resultado real de cada paso, aunque sea malo.

## Qué se puede automatizar y qué no

| Comprobación | Automatizada (resultado) | Necesita móviles |
|---|---|---|
| Crear sala, unirse, roles, zona, capturas, final, reconexión | ✔ contra producción: 19/19 + 15/15 (`registros/01`, `02`) | Confirmarlo con GPS real |
| Corte de red de 5 s y de 35 s (sin aviso de cierre) | ✔ en local, servidor y cliente reales: 9/9 (`registros/05`) | Cortes reales: modo avión, túnel o ascensor |
| Pantalla bloqueada 1, 3 y 5 min; cambio de app | ✗ no se puede: depende del sistema del móvil | **Sí** |
| Pérdida de GPS (interior, sótano) | Parcial: reglas de antigüedad probadas en el motor | **Sí** |
| App instalada (icono, pantalla completa) | Chrome la reconoce como instalable (local) | **Sí**: Android e iPhone |
| Arranque en frío de Render | ✔ script `server/arranque-frio.mjs` (`registros/03`) | — |

## Preparación (10 min antes)

1. Abrir la URL un par de minutos antes: si el servicio estaba dormido, **tarda unos 22 s en responder** (medido: `registros/03`). Es normal; no hay que recargar.
2. Mínimo **2 móviles en redes distintas**: uno con datos móviles y otro con Wi-Fi o datos de otra compañía. Mejor si son **Android e iPhone**.
3. Batería por encima del 50 %, brillo medio y ubicación en «Precisa». En iPhone: Ajustes → Privacidad → Localización → Safari → «Al usar la app» + «Ubicación exacta».
4. **Instalación:** en Android, Chrome → menú → «Instalar aplicación»; en iPhone, Safari → Compartir → «Añadir a pantalla de inicio». Comprobad que **el icono es el símbolo de THE OUTRUN** (naranja y blanco sobre fondo oscuro) y que se abre a pantalla completa. Si ya teníais un acceso directo antiguo, **borradlo y volved a instalarlo**: el sistema guarda el icono anterior.
5. Una persona apunta en cada paso: hora del reloj del móvil, qué ve cada pantalla, y capturas o fotos.

## Pruebas (partida Clásico, 250 m, 20 min, en un sitio abierto y seguro)

| # | Paso | Qué debe pasar | Anotar |
|---|---|---|---|
| 1 | A crea la sala y B entra con el enlace o QR desde otra red | Los dos ven la sala, el mapa con calles y «CONECTADO» | Tiempo de entrada |
| 2 | Pantalla encendida, 3 min caminando | La posición del compañero se mueve en el mapa del otro (cada ~5 s); GPS «±N m» | Precisión en cada móvil |
| 3 | **Bloquear B 1 min** y desbloquear | A ve «B no da señales: sin conexión» a los ~30 s. Al desbloquear, B vuelve solo (sin recargar), A ve «B ha vuelto», mismo rol | Segundos hasta volver |
| 4 | **Bloquear B 3 min** | Igual que el 3. B sigue en la partida. En el desbloqueo, su posición vuelve a actualizarse | ¿Avisos repetidos o raros? |
| 5 | **Bloquear B 5 min y 30 s** | A los 5 min B **queda fuera** de la partida (regla D-057), y A ve «ha quedado fuera: más de 5 min sin conexión». Al desbloquear, B ve que ha quedado fuera | Confirmar la regla con móviles |
| 6 | B **cambia a otra app** (WhatsApp) 1 min y vuelve | Como en el 3 | |
| 7 | B en **modo avión 10 s** y lo quita | Sin cambios visibles o «Reconectando» breve; vuelve solo | |
| 8 | B en **modo avión 45 s** y lo quita | B ve «Reconectando…»; A ve «sin conexión» a los ~30 s; al quitar el modo avión, B vuelve en pocos segundos con el mismo rol | Segundos hasta volver |
| 9 | B se mete **en un portal o sótano** (sin GPS, con datos) 1 min | B: «Lectura antigua (hace…)» o «Sin señal». **No** queda «sin conexión», porque la app sigue viva. Las capturas sobre B se rechazan por ubicación antigua | Texto de GPS de B |
| 10 | Fase de zona a los 5:00 de persecución | Aviso «La zona se cierra», mismo círculo en los dos (foto a la vez) | |
| 11 | **Captura:** el cazador toca al fugitivo y reclama | El fugitivo recibe «¿Te ha pillado…?»; con «Sí» queda capturado en los dos | |
| 12 | Reclamar **justo después** de un corte (modo avión 25 s, pulsar reclamar durante el corte) | Al volver la red **no** se envía la reclamación antigua: aviso «Sin conexión cuando lo pulsaste…» | |
| 13 | Partida hasta el final, o «Terminar partida» | Mission Report igual en los dos | |
| 14 | Revancha | Empieza limpia, mismo grupo | |
| 15 | **Recargar la página** a mitad de partida (con la app instalada: cerrarla y abrirla) | Vuelve a la partida, con la misma identidad y el mismo rol | |

**No hacer durante la partida:** desplegar en Render (`git push` a `mapa-real`) ni reiniciar el servicio. **Se pierden las salas en curso** (ver el informe).

## Resultado esperado y criterio

- Pasos 1–4, 6–8 y 10–15 correctos en Android, y en iPhone si se prueba.
- Si falla el 3 o el 4 (bloqueo corto) en un sistema concreto: es la limitación del navegador en segundo plano. Anotadlo, con el modelo de móvil y la versión.
- Al terminar: capturas, notas y, si la prueba se hizo con un servidor local con diagnóstico, el informe de `%USERPROFILE%\OutrunDiagnostico\`. En Render no hay registro de diagnóstico (`DIAG_FILE` no está activado).
