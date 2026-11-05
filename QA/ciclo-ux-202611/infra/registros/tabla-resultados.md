| Escenario | Jug. | CPU media ACTIVE (% 1 núcleo) | CPU máx ACTIVE | RSS máx (MB) | Entrantes msg/s | Salientes msg/s | Salientes kB/s | RTT ping p50/p95/p99 ACTIVE (ms) | claim_tag p50/p95/p99 (ms) | Reconexión: recuperados · todos en (ms) · p50 | Reinicio | Final (ms) | Errores |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01-sala-5j | 5 | 0.2 | 4.6 | 79.2 | 5.5 | 1.8 | 0.5 | 1/1/2 | 3/7/7 | 5/5 · 735 · 622 | — | 4 (5/5) | ninguno |
| 02-sala-10j | 10 | 3.3 | 9.4 | 95.3 | 11.5 | 3.7 | 1.7 | 1/2/2 | 5/34/42 | 10/10 · 824 · 783 | — | 7 (10/10) | ninguno |
| 03-sala-15j | 15 | 8.9 | 18.7 | 145.3 | 17 | 5.5 | 4.1 | 2/24/44 | 7/36/74 | 15/15 · 864 · 805 | — | 8 (15/15) | ninguno |
| 04-sala-20j | 20 | 14.2 | 26.4 | 204.4 | 22.7 | 6.9 | 7.1 | 1/564/564 | 8/132/180 | 20/20 · 941 · 798 | — | 11 (20/20) | ninguno |
| 05-5salas-10j | 50 | 17.9 | 35.8 | 181.2 | 57.2 | 17.8 | 8.1 | 1/100/130 | 7/106/181 | 50/50 · 997 · 856 | sin-estado: 0/50 recuperados, 50 sesiones perdidas, todos en — ms | 75023 (0/30) | cmd_claim_tag_already_pending:6, cierre_1006:50, session_lost_bad_session:20, error_bad_session:20, error_rate_limited:30, error_no_session:1, cmd_end_game_sin_respuesta_15s:1, timeout_FINISHED:1 |
| 06-10salas-10j | 100 | 35.7 | 66.8 | 180.6 | 112.8 | 35.6 | 16 | 2/260/273 | 14/283/412 | 100/100 · 1547 · 1283 | estado: 100/100 recuperados, 0 sesiones perdidas, todos en 777 ms | 30 (100/100) | cmd_claim_tag_already_pending:9, cierre_1006:100 |
| 07-25salas-10j | 250 | 70.6 | 97.4 | 244.4 | 285.6 | 84.5 | 36.7 | 353/1181/1315 | 247/912/1485 | 250/250 · 2215 · 1581 | estado: 250/250 recuperados, 0 sesiones perdidas, todos en 936 ms | 45 (250/250) | cierre_1006:250 |
| 08-50salas-10j | 500 | 81.7 | 92.9 | 266.5 | 570.6 | 94.2 | 17.3 | 1095/2262/2478 | 1038/2197/3114 | 500/500 · 11134 · 4330 | — | 951 (500/500) | cmd_claim_tag_rate_limited:52, cierre_1006:120, cmd_claim_tag_wrong_phase:7 |
