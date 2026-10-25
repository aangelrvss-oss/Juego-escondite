package es.escondite.s1.core;

import java.util.Locale;

/**
 * Clasificación de la "Lectura actual" que se muestra en pantalla. Frescura y precisión son
 * independientes: una lectura reciente puede ser imprecisa y una precisa puede haberse quedado
 * antigua. Umbrales EXPERIMENTALES (D-038), los mismos que {@link Availability}.
 * Nada de esta clase se guarda: las coordenadas solo se formatean para mostrarlas.
 */
public final class LiveReading {
    private LiveReading() {}

    public enum Freshness {
        UPDATED("Actualizada"),
        OLD("Antigua"),
        NONE("Sin lectura");

        public final String label;

        Freshness(String label) {
            this.label = label;
        }
    }

    public enum Accuracy {
        SUFFICIENT("Suficiente"),
        INSUFFICIENT("Insuficiente"),
        UNKNOWN("Desconocida");

        public final String label;

        Accuracy(String label) {
            this.label = label;
        }
    }

    /** @param ageMs antigüedad de la lectura, o un valor negativo si todavía no hay ninguna */
    public static Freshness freshness(long ageMs) {
        if (ageMs < 0) return Freshness.NONE;
        return ageMs <= ExperimentalParams.CURRENT_MAX_AGE_MS ? Freshness.UPDATED : Freshness.OLD;
    }

    /** @param accuracyM precisión horizontal declarada por el sistema, o NaN si no la da */
    public static Accuracy accuracy(float accuracyM) {
        if (Float.isNaN(accuracyM) || accuracyM < 0) return Accuracy.UNKNOWN;
        return accuracyM <= ExperimentalParams.CURRENT_MAX_ACCURACY_M ? Accuracy.SUFFICIENT : Accuracy.INSUFFICIENT;
    }

    /**
     * "—" sin lectura; "N s" por debajo de un minuto; "M min SS s" a partir de ahí.
     * Redondea hacia arriba: nunca muestra una lectura más reciente de lo que es, y así
     * "15 s" siempre es "Actualizada" y "16 s" siempre es "Antigua".
     */
    public static String formatAge(long ageMs) {
        if (ageMs < 0) return "—";
        long s = (ageMs + 999) / 1000;
        if (s < 60) return s + " s";
        return String.format(Locale.ROOT, "%d min %02d s", s / 60, s % 60);
    }

    /** Cinco decimales, con punto decimal. Solo para mostrar en pantalla. */
    public static String formatCoordinate(double value) {
        return String.format(Locale.ROOT, "%.5f", value);
    }
}
