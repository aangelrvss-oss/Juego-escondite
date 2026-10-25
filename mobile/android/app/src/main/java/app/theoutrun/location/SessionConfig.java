package app.theoutrun.location;

import es.escondite.s1.core.ExperimentalParams;

/**
 * Intervalo solicitado al sistema. Parámetro EXPERIMENTAL (D-038): por defecto el de S1 (5 s) y
 * ajustable para las pruebas dentro de un rango acotado. Android puede entregar lecturas más
 * espaciadas de lo pedido; la sesión registra lo que realmente llega.
 */
public final class SessionConfig {
    private SessionConfig() {}

    public static final long MIN_INTERVAL_MS = 1_000;
    public static final long MAX_INTERVAL_MS = 60_000;
    public static final long DEFAULT_INTERVAL_MS = ExperimentalParams.REQUEST_INTERVAL_MS;

    public static boolean isValidInterval(long ms) {
        return ms >= MIN_INTERVAL_MS && ms <= MAX_INTERVAL_MS;
    }
}
