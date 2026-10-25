package es.escondite.s1.core;

/** Distancia entre dos puntos. Solo se usa en memoria; las coordenadas nunca se guardan. */
public final class Geo {
    private Geo() {}

    private static final double EARTH_RADIUS_M = 6_371_008.8;

    public static double distanceM(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double h = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
    }
}
