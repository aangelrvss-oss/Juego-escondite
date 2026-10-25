package es.escondite.s1;

import android.content.Context;
import android.os.BatteryManager;
import android.os.PowerManager;
import es.escondite.s1.core.DeviceState;

/** Lee el estado del dispositivo que acompaña a cada muestra. No incluye ubicación. */
final class DeviceStateReader {
    private DeviceStateReader() {}

    static DeviceState read(Context context, boolean appVisible) {
        PowerManager pm = context.getSystemService(PowerManager.class);
        BatteryManager bm = context.getSystemService(BatteryManager.class);
        return new DeviceState(
                pm.isInteractive(),
                appVisible,
                bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY),
                bm.isCharging(),
                pm.isPowerSaveMode(),
                pm.isDeviceIdleMode());
    }

    static boolean ignoringBatteryOptimizations(Context context) {
        return context.getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(context.getPackageName());
    }
}
