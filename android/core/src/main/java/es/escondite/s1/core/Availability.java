package es.escondite.s1.core;

/** Misma clasificación que el motor de S0 (GAME_STATE_MACHINE §6.3), con umbrales experimentales. */
public enum Availability {
    CURRENT,
    STALE,
    UNAVAILABLE;

    public static Availability classify(long ageMs, float accuracyM) {
        if (ageMs > ExperimentalParams.STALE_MAX_AGE_MS) return UNAVAILABLE;
        if (ageMs > ExperimentalParams.CURRENT_MAX_AGE_MS) return STALE;
        if (Float.isNaN(accuracyM) || accuracyM > ExperimentalParams.CURRENT_MAX_ACCURACY_M) return STALE;
        return CURRENT;
    }
}
