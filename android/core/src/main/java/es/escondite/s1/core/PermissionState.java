package es.escondite.s1.core;

/**
 * Estado del permiso de ubicación tal como lo puede conocer la app.
 * "Denegado permanentemente" solo se afirma cuando la última respuesta al diálogo fue una
 * denegación y Android ya no permite volver a mostrarlo (shouldShowRequestPermissionRationale
 * devuelve false justo después). Antes de la primera petición ese método también devuelve
 * false, por eso no basta con consultarlo al abrir la pantalla.
 */
public enum PermissionState {
    PRECISE("Precisa"),
    APPROXIMATE_ONLY("Solo aproximada (insuficiente para la prueba)"),
    DENIED("Denegada"),
    DENIED_PERMANENTLY("Denegada permanentemente: cámbiala en los ajustes de la app");

    public final String label;

    PermissionState(String label) {
        this.label = label;
    }

    /**
     * @param deniedWithoutRationale la última respuesta fue "denegar" y Android ya no mostrará el diálogo
     */
    public static PermissionState classify(boolean fine, boolean coarse, boolean deniedWithoutRationale) {
        if (fine) return PRECISE;
        if (coarse) return APPROXIMATE_ONLY;
        return deniedWithoutRationale ? DENIED_PERMANENTLY : DENIED;
    }

    /**
     * Interpreta la respuesta al diálogo de permisos.
     * @return true si debe recordarse como denegación permanente
     */
    public static boolean deniedPermanentlyAfterResult(boolean fineGranted, boolean coarseGranted, boolean shouldShowRationale) {
        return !fineGranted && !coarseGranted && !shouldShowRationale;
    }
}
