# Arranca el servidor de THE OUTRUN para una prueba con móviles (detrás de un túnel HTTPS).
#
# Uso (desde la carpeta del repositorio, en PowerShell):
#   .\server\iniciar-servidor.ps1                 # puerto 8787, preparado para el túnel
#   .\server\iniciar-servidor.ps1 -SoloComprobar  # solo las comprobaciones, sin arrancar nada
#   .\server\iniciar-servidor.ps1 -Puerto 8788    # otro puerto, si el 8787 está ocupado
#   .\server\iniciar-servidor.ps1 -ArchivoEstado outrun-estado.json   # (opcional) sobrevivir a un reinicio
#   .\server\iniciar-servidor.ps1 -SinDiagnostico   # sin registro de diagnóstico de la prueba
#   .\server\iniciar-servidor.ps1 -PermitirSuspension   # deja que Windows suspenda el equipo (no recomendado)
#
# Suspensión: mientras el servidor está en marcha, el script pide a Windows que NO suspenda el equipo por
# inactividad (como un reproductor de vídeo) y lo libera al detenerlo. Motivo: en la prueba física del
# 31/10/2026 el portátil se suspendió a los 10 min con batería y se cayeron el servidor y el túnel en
# plena partida. Cerrar la tapa o pulsar el botón de encendido SÍ lo suspende igualmente.
#
# Diagnóstico (activado por defecto): el servidor anota en %USERPROFILE%\OutrunDiagnostico\ un registro
# de la prueba (conexiones, fases, GPS resumido, capturas, errores; con alias J1/J2 y sin coordenadas,
# nombres, códigos de sala ni IP) y, al detenerlo, este script genera el informe .md a su lado.
#
# Qué hace: comprueba Node, los archivos y el puerto; arranca `node server/main.ts` en esta misma
# ventana, solo en este ordenador (127.0.0.1) y con TRUST_PROXY=1 (la IP real de cada móvil llega del
# túnel); espera a que /health responda y explica el siguiente paso. NO abre el túnel ni instala nada.
# Para detenerlo: Ctrl+C en esta ventana (el servidor hace su último guardado y se cierra).

param(
  [int]$Puerto = 8787,
  [string]$ArchivoEstado = '',
  [string]$ArchivoDiagnostico = '',
  [switch]$SinDiagnostico,
  [switch]$SinTunel,
  [switch]$Registro,
  [switch]$PermitirSuspension,
  [switch]$SoloComprobar
)

$raiz = Split-Path -Parent $PSScriptRoot
$fallos = @()
function Ok($texto) { Write-Host "  [ok] $texto" -ForegroundColor Green }
function Mal($texto) { Write-Host "  [!!] $texto" -ForegroundColor Red; $script:fallos += $texto }

Write-Host ''
Write-Host 'THE OUTRUN · comprobaciones antes de arrancar' -ForegroundColor Cyan

# 1. Node 22.18 o superior (ejecuta TypeScript directamente).
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Mal 'Node.js no está instalado o no está en el PATH. Hace falta Node 22.18 o superior.'
} else {
  $version = (& node --version).TrimStart('v')
  $partes = $version.Split('.') | ForEach-Object { [int]$_ }
  if ($partes[0] -gt 22 -or ($partes[0] -eq 22 -and $partes[1] -ge 18)) { Ok "Node $version" }
  else { Mal "Node $version es demasiado antiguo: hace falta 22.18 o superior." }
}

# 2. Archivos del servidor y de la interfaz web.
foreach ($archivo in @('server\main.ts', 'mobile\www\index.html')) {
  if (Test-Path (Join-Path $raiz $archivo)) { Ok "Encontrado $archivo" } else { Mal "Falta $archivo. ¿Estás en la carpeta correcta del repositorio?" }
}

# 3. Configuración: el servidor solo debe escuchar en este ordenador; el túnel se conecta a él.
if ($Puerto -lt 1024 -or $Puerto -gt 65535) { Mal "Puerto $Puerto no válido (usa uno entre 1024 y 65535)." }
if ($env:HOST -and $env:HOST -ne '127.0.0.1') {
  Mal "La variable HOST vale '$($env:HOST)'. Para la prueba el servidor debe escuchar solo en 127.0.0.1. Ciérrala con: Remove-Item Env:HOST"
} else { Ok 'Escuchará solo en este ordenador (127.0.0.1): no se abre ningún puerto a la red' }
if (-not $SinDiagnostico -and -not $ArchivoDiagnostico) {
  # En la carpeta del usuario y no en Documentos: Documentos suele sincronizarse con OneDrive.
  $ArchivoDiagnostico = Join-Path $env:USERPROFILE ("OutrunDiagnostico\diagnostico-{0}.jsonl" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
}
if ($SinDiagnostico) { $ArchivoDiagnostico = '' }
# Ruta completa: el servidor arranca en la carpeta del repositorio y el informe se genera desde aquí.
if ($ArchivoDiagnostico) { $ArchivoDiagnostico = [IO.Path]::GetFullPath([IO.Path]::Combine((Get-Location).Path, $ArchivoDiagnostico)) }
if ($ArchivoDiagnostico) { Ok "Diagnóstico de la prueba en $ArchivoDiagnostico (sin coordenadas, nombres, códigos de sala ni IP)" }
if ($ArchivoEstado) { Ok "Guardará las salas en $ArchivoEstado (sin coordenadas de jugadores ni secretos; sí nombres y el centro de la zona). Bórralo al terminar." }

# 4. Puerto libre. No se cierra ningún programa ajeno.
$escucha = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($escucha) {
  $proceso = Get-Process -Id $escucha.OwningProcess -ErrorAction SilentlyContinue
  Mal "El puerto $Puerto está ocupado por '$($proceso.ProcessName)' (PID $($escucha.OwningProcess)). Si es un servidor de THE OUTRUN anterior, ciérralo con Ctrl+C en su ventana; si no, usa otro puerto: -Puerto 8788"
} else { Ok "Puerto $Puerto libre" }

# 5. Túnel (solo se informa: este script no lo abre ni lo instala).
if (Get-Command cloudflared -ErrorAction SilentlyContinue) { Ok 'cloudflared está instalado (el túnel lo abres tú en otra ventana)' }
else { Write-Host '  [--] cloudflared no está instalado. Hace falta para que los móviles entren desde sus datos (ver mobile\PRUEBA_REAL_EN_CALLE.md).' -ForegroundColor Yellow }

# 6. Mapa real (solo se informa: sin él, la partida usa el radar). Ver mobile\MAPA.md.
if (-not (Test-Path (Join-Path $raiz 'mobile\www\vendor\maplibre-gl\maplibre-gl.js'))) {
  Write-Host '  [--] Mapa: falta la biblioteca (en mobile\: npm install y npm run vendor). Se usará el radar.' -ForegroundColor Yellow
} elseif (-not (Test-Path (Join-Path $raiz 'mobile\www\mapa.config.json'))) {
  Write-Host '  [--] Mapa: falta mobile\www\mapa.config.json con la clave del proveedor (mobile\MAPA.md). Se usará el radar.' -ForegroundColor Yellow
} else { Ok 'Mapa: biblioteca y configuración presentes (la clave no se comprueba hasta abrir una partida)' }

if ($fallos.Count -gt 0) {
  Write-Host ''
  Write-Host "NO SE PUEDE ARRANCAR: $($fallos.Count) problema(s) arriba." -ForegroundColor Red
  exit 1
}
if ($SoloComprobar) {
  Write-Host ''
  Write-Host 'Todo correcto. (Solo comprobaciones: no se ha arrancado nada.)' -ForegroundColor Green
  exit 0
}

# Arranque. Las variables solo valen para esta ejecución y se restauran al terminar.
$anteriores = @{}
$variables = @{ PORT = "$Puerto"; HOST = '127.0.0.1'; TRUST_PROXY = $(if ($SinTunel) { '' } else { '1' }); STATE_FILE = $ArchivoEstado; DIAG_FILE = $ArchivoDiagnostico; LOG = $(if ($Registro) { '1' } else { '' }) }
foreach ($nombre in $variables.Keys) {
  $anteriores[$nombre] = [Environment]::GetEnvironmentVariable($nombre, 'Process')
  [Environment]::SetEnvironmentVariable($nombre, $(if ($variables[$nombre]) { $variables[$nombre] } else { $null }), 'Process')
}

$servidor = $null
$despierto = $false
try {
  # Que Windows no suspenda el equipo por inactividad mientras sirve la partida (se libera en `finally`).
  # ES_CONTINUOUS | ES_SYSTEM_REQUIRED: vale para este hilo hasta que se restablece o termina el script.
  if (-not $PermitirSuspension) {
    try {
      Add-Type -Namespace Outrun -Name Energia -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);' -ErrorAction Stop
      $despierto = [Outrun.Energia]::SetThreadExecutionState([uint32]'0x80000001') -ne 0
    } catch { $despierto = $false }
    if ($despierto) { Ok 'El equipo no se suspenderá por inactividad mientras el servidor esté en marcha (cerrar la tapa sí lo suspende)' }
    else { Write-Host '  [--] No se ha podido impedir la suspensión: pon «Suspender» en «Nunca» en la configuración de energía.' -ForegroundColor Yellow }
  }
  Write-Host ''
  Write-Host 'Arrancando el servidor...' -ForegroundColor Cyan
  $servidor = Start-Process -FilePath $node.Source -ArgumentList 'server/main.ts' -WorkingDirectory $raiz -NoNewWindow -PassThru
  $salud = $null
  for ($i = 0; $i -lt 20 -and -not $salud; $i++) {
    Start-Sleep -Milliseconds 500
    if ($servidor.HasExited) { break }
    try { $salud = Invoke-RestMethod -Uri "http://127.0.0.1:$Puerto/health" -TimeoutSec 2 } catch { $salud = $null }
  }
  if (-not $salud -or -not $salud.ok) {
    Write-Host "EL SERVIDOR NO HA ARRANCADO (revisa los mensajes de arriba)." -ForegroundColor Red
    exit 1
  }
  Write-Host ''
  Write-Host "SERVIDOR LISTO en http://127.0.0.1:$Puerto  (/health: ok, salas: $($salud.rooms))" -ForegroundColor Green
  Write-Host ''
  Write-Host 'Siguiente paso, en OTRA ventana de PowerShell (solo si has autorizado el túnel):'
  Write-Host "    cloudflared tunnel --url http://127.0.0.1:$Puerto"
  Write-Host 'Copia la dirección https://....trycloudflare.com que aparezca y ábrela en los móviles.'
  Write-Host ''
  Write-Host 'Para detener el servidor: Ctrl+C en ESTA ventana. Cierra antes el túnel (Ctrl+C en la suya).' -ForegroundColor Yellow
  Write-Host ''
  Wait-Process -Id $servidor.Id
} finally {
  # Ctrl+C llega también a Node (comparten la ventana), que guarda y se cierra solo. Si en 10 s no se ha
  # cerrado, se detiene: es el proceso que ha arrancado este script, nunca otro.
  if ($servidor -and -not $servidor.HasExited) {
    if (-not $servidor.WaitForExit(10000)) { Stop-Process -Id $servidor.Id -Force -ErrorAction SilentlyContinue }
  }
  # Devuelve a Windows su comportamiento normal de suspensión.
  if ($despierto) { [void][Outrun.Energia]::SetThreadExecutionState([uint32]'0x80000000') }
  foreach ($nombre in $anteriores.Keys) { [Environment]::SetEnvironmentVariable($nombre, $anteriores[$nombre], 'Process') }
  Write-Host 'Servidor detenido.' -ForegroundColor Cyan
  # Informe de diagnóstico junto al registro (no necesita Internet). Si no se genera aquí, se puede
  # generar después con: node server\informe-diagnostico.mjs <archivo .jsonl>
  if ($ArchivoDiagnostico -and (Test-Path $ArchivoDiagnostico)) {
    & $node.Source (Join-Path $raiz 'server\informe-diagnostico.mjs') $ArchivoDiagnostico
    Write-Host "Registro e informe en: $(Split-Path -Parent $ArchivoDiagnostico)" -ForegroundColor Cyan
  }
}
