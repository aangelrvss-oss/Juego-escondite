#!/usr/bin/env bash
# Serie de escenarios de carga LOCAL (cada uno arranca y detiene su propio servidor en 8811–8819).
# Uso (desde la raíz del repositorio): bash QA/ciclo-ux-202611/infra/scripts/serie.sh [desde]
# 01–04 se ejecutaron primero; la 1.ª ejecución de 05 se colgó (registros/05-*.colgado-1a-ejecucion.*) y
# carga.mjs se corrigió (plazo por comando, vigilante de 15 min, rate_limited cuenta como sesión no recuperada).
# Todos los escenarios usan MAX_ROOMS_PER_IP=1000 (todo sale de 127.0.0.1); producción usa el valor por defecto, 5.
set -u
S=QA/ciclo-ux-202611/infra/scripts/carga.mjs
R=QA/ciclo-ux-202611/infra/registros
run() { # nombre salas jugadores puerto [reinicio]
  echo "=== $1 ($2 salas x $3 jugadores, puerto $4, reinicio ${5:-no}) $(date +%T)"
  node "$S" --nombre "$1" --salas "$2" --jugadores "$3" --activo 60 --puerto "$4" --reinicio "${5:-no}" > "$R/$1.txt" 2>&1
  echo "    salida $? $(date +%T)"
}
run 05-5salas-10j 5 10 8815 sin-estado
run 06-10salas-10j 10 10 8816 estado
run 07-25salas-10j 25 10 8817 estado
run 08-50salas-10j 50 10 8818
echo "=== serie terminada $(date +%T)"
