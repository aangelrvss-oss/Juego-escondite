package app.theoutrun.location;

import es.escondite.s1.core.PermissionState;

/** Traduce el estado de permisos (núcleo de S1) a los valores del contrato. Java puro. */
public final class PermissionMapper {
    private PermissionMapper() {}

    /** Android 13 (API 33) introdujo el permiso de notificaciones en tiempo de ejecución. */
    public static final int NOTIFICATIONS_RUNTIME_SDK = 33;

    /**
     * @param everAsked si la app ya pidió el permiso alguna vez: sin pedirlo, Android lo da como
     *                  denegado, pero para el usuario todavía está «sin pedir».
     */
    public static String location(PermissionState state, boolean everAsked) {
        switch (state) {
            case PRECISE:
                return "precise";
            case APPROXIMATE_ONLY:
                return "approximate";
            case DENIED_PERMANENTLY:
                return "denied_permanently";
            default:
                return everAsked ? "denied" : "prompt";
        }
    }

    public static String notifications(int sdkInt, boolean granted, boolean everAsked) {
        if (sdkInt < NOTIFICATIONS_RUNTIME_SDK) return "not_required";
        if (granted) return "granted";
        return everAsked ? "denied" : "prompt";
    }
}
