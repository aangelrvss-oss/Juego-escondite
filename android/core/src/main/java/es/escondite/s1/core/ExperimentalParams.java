package es.escondite.s1.core;

/**
 * Parámetros EXPERIMENTALES de S1 (D-038). Ninguno está aprobado como regla del juego:
 * sirven para medir y se recalibrarán con los resultados del dispositivo real.
 */
public final class ExperimentalParams {
    private ExperimentalParams() {}

    /** Intervalo solicitado al sistema (hipótesis heredada de TECHNICAL_SPIKE_PLAN §3.2). */
    public static final long REQUEST_INTERVAL_MS = 5_000;

    /** Clasificación de antigüedad, igual que la hipótesis de S0 (GAME_STATE_MACHINE §6.3). */
    public static final long CURRENT_MAX_AGE_MS = 15_000;
    public static final long STALE_MAX_AGE_MS = 120_000;
    public static final float CURRENT_MAX_ACCURACY_M = 50f;

    /** Sin muestras durante más de este tiempo se considera un hueco. */
    public static final long GAP_THRESHOLD_MS = 30_000;

    /** Cada cuánto el servicio deja constancia de que sigue vivo. */
    public static final long HEARTBEAT_MS = 30_000;

    /** Intervalo entre avisos de prueba (D-036) cuando el usuario los activa. */
    public static final long TEST_NOTIFICATION_INTERVAL_MS = 2 * 60_000;

    /** Criterios de salida experimentales (TECHNICAL_SPIKE_PLAN §4, T05 y T11). */
    public static final double EXIT_MIN_LOCKED_COVERAGE = 0.80;
    public static final long EXIT_MAX_LOCKED_GAP_MS = 30_000;
    public static final double EXIT_MAX_BATTERY_DROP_PCT_PER_HOUR = 10.0;
}
