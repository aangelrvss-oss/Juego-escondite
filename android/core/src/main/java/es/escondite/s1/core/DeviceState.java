package es.escondite.s1.core;

/** Estado del dispositivo en el momento de una muestra o evento. No contiene ubicación. */
public record DeviceState(
        boolean screenOn,
        boolean appVisible,
        int batteryPct,
        boolean charging,
        boolean powerSave,
        boolean deviceIdle) {

    public static final DeviceState UNKNOWN = new DeviceState(false, false, -1, false, false, false);
}
