package app.theoutrun.location;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;

/**
 * Puente «OutrunLocation» entre la interfaz y el servicio de ubicación (contrato:
 * mobile/contract/location-bridge.json). No contiene reglas del juego: solo permisos, sesión de
 * diagnóstico, estado y exportación del registro.
 */
@CapacitorPlugin(
    name = "OutrunLocation",
    permissions = {
        @Permission(alias = OutrunLocationPlugin.LOCATION,
                    strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = OutrunLocationPlugin.NOTIFICATIONS, strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class OutrunLocationPlugin extends Plugin {

    static final String LOCATION = "location";
    static final String NOTIFICATIONS = "notifications";
    private static final String PREFS = "outrun_permissions";

    @Override
    public void load() {
        LocationSessionService.setListener(new LocationSessionService.Listener() {
            @Override
            public void onReading(Map<String, Object> reading) {
                notifyListeners("reading", toJs(reading));
            }

            @Override
            public void onStatus(Map<String, Object> status) {
                notifyListeners("status", toJs(status));
            }
        });
    }

    @Override
    protected void handleOnResume() {
        LocationSessionService.appVisible = true;
    }

    @Override
    protected void handleOnPause() {
        LocationSessionService.appVisible = false;
    }

    @Override
    protected void handleOnDestroy() {
        LocationSessionService.setListener(null);
    }

    // ---------------------------------------------------------------- permisos

    @Override
    @PluginMethod
    public void checkPermissions(PluginCall call) {
        call.resolve(toJs(permissions()));
    }

    @Override
    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (!hasLocationPermission()) {
            prefs().edit().putBoolean("location_asked", true).apply();
            requestPermissionForAlias(LOCATION, call, "afterLocationPermission");
        } else {
            afterLocationPermission(call);
        }
    }

    @PermissionCallback
    private void afterLocationPermission(PluginCall call) {
        boolean fine = granted(Manifest.permission.ACCESS_FINE_LOCATION);
        boolean coarse = granted(Manifest.permission.ACCESS_COARSE_LOCATION);
        Activity activity = getActivity();
        boolean rationale = activity != null && activity.shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION);
        boolean permanently = es.escondite.s1.core.PermissionState.deniedPermanentlyAfterResult(fine, coarse, rationale);
        prefs().edit().putBoolean("location_denied_permanently", permanently).apply();
        boolean needsNotifications = Build.VERSION.SDK_INT >= PermissionMapper.NOTIFICATIONS_RUNTIME_SDK
                && getPermissionState(NOTIFICATIONS) != PermissionState.GRANTED
                && !prefs().getBoolean("notifications_asked", false);
        if ((fine || coarse) && needsNotifications) {
            prefs().edit().putBoolean("notifications_asked", true).apply();
            requestPermissionForAlias(NOTIFICATIONS, call, "afterNotificationPermission");
            return;
        }
        call.resolve(toJs(permissions()));
    }

    @PermissionCallback
    private void afterNotificationPermission(PluginCall call) {
        call.resolve(toJs(permissions()));
    }

    private Map<String, Object> permissions() {
        boolean fine = granted(Manifest.permission.ACCESS_FINE_LOCATION);
        boolean coarse = granted(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (fine || coarse) prefs().edit().putBoolean("location_denied_permanently", false).apply();
        es.escondite.s1.core.PermissionState state = es.escondite.s1.core.PermissionState.classify(
                fine, coarse, prefs().getBoolean("location_denied_permanently", false));
        String location = PermissionMapper.location(state, prefs().getBoolean("location_asked", false));
        boolean notificationsGranted = Build.VERSION.SDK_INT < PermissionMapper.NOTIFICATIONS_RUNTIME_SDK
                || granted(Manifest.permission.POST_NOTIFICATIONS);
        String notifications = PermissionMapper.notifications(Build.VERSION.SDK_INT, notificationsGranted,
                prefs().getBoolean("notifications_asked", false));
        return Payloads.permissions(location, notifications);
    }

    private boolean hasLocationPermission() {
        return granted(Manifest.permission.ACCESS_FINE_LOCATION) || granted(Manifest.permission.ACCESS_COARSE_LOCATION);
    }

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---------------------------------------------------------------- proveedor y sesión

    @PluginMethod
    public void getProviderStatus(PluginCall call) {
        LocationManager lm = getContext().getSystemService(LocationManager.class);
        boolean enabled = lm.isLocationEnabled();
        boolean fused = lm.hasProvider(LocationManager.FUSED_PROVIDER);
        String provider = enabled ? (fused ? "fused" : "gps") : null;
        call.resolve(toJs(Payloads.provider(enabled, provider, fused, lm.isProviderEnabled(LocationManager.GPS_PROVIDER))));
    }

    @PluginMethod
    public void startSession(PluginCall call) {
        Long requested = call.getLong("intervalMs", SessionConfig.DEFAULT_INTERVAL_MS);
        long intervalMs = requested == null ? SessionConfig.DEFAULT_INTERVAL_MS : requested;
        if (!SessionConfig.isValidInterval(intervalMs)) {
            call.reject("Intervalo fuera de rango", BridgeErrors.INVALID_INTERVAL);
            return;
        }
        if (!hasLocationPermission()) {
            call.reject("Falta el permiso de ubicación", BridgeErrors.PERMISSION_MISSING);
            return;
        }
        if (!getContext().getSystemService(LocationManager.class).isLocationEnabled()) {
            call.reject("La ubicación del sistema está desactivada", BridgeErrors.PROVIDER_DISABLED);
            return;
        }
        if (LocationSessionService.isRunning()) {
            call.reject("Ya hay una sesión en curso", BridgeErrors.ALREADY_RUNNING);
            return;
        }
        Intent intent = new Intent(getContext(), LocationSessionService.class)
                .setAction(LocationSessionService.ACTION_START)
                .putExtra(LocationSessionService.EXTRA_INTERVAL_MS, intervalMs);
        try {
            // Solo desde la app visible (requisito de Android 14 sin ubicación en segundo plano).
            ContextCompat.startForegroundService(getContext(), intent);
        } catch (RuntimeException e) {
            call.reject("Android no permitió iniciar el servicio", BridgeErrors.SERVICE_START_DENIED);
            return;
        }
        // El servicio confirma el inicio (o el error) con un evento «status».
        Map<String, Object> status = LocationSessionService.status("Iniciando…");
        status.put("running", true);
        status.put("intervalMs", intervalMs);
        status.put("lastError", null);
        call.resolve(toJs(status));
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        if (!LocationSessionService.isRunning()) {
            call.resolve(toJs(LocationSessionService.status(null)));
            return;
        }
        getContext().startService(new Intent(getContext(), LocationSessionService.class).setAction(LocationSessionService.ACTION_STOP));
        Map<String, Object> status = LocationSessionService.status("Deteniendo…");
        status.put("running", false);
        call.resolve(toJs(status));
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        boolean running = LocationSessionService.isRunning();
        String abnormal = SessionStore.detectAbnormalEnd(getContext(), running);
        Map<String, Object> status = LocationSessionService.status(abnormal);
        if (abnormal != null) status.put("lastError", BridgeErrors.ABNORMAL_END);
        call.resolve(toJs(status));
    }

    // ---------------------------------------------------------------- exportación

    @PluginMethod
    public void exportSession(PluginCall call) {
        File latest = SessionStore.latest(getContext());
        if (latest == null) {
            call.reject("Todavía no hay ninguna sesión", BridgeErrors.NO_SESSION);
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("text/csv")
                .putExtra(Intent.EXTRA_TITLE, latest.getName());
        startActivityForResult(call, intent, "afterExport");
    }

    @ActivityCallback
    private void afterExport(PluginCall call, ActivityResult result) {
        JSObject out = new JSObject();
        File latest = SessionStore.latest(getContext());
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null || latest == null) {
            out.put("saved", false);
            out.put("name", JSObject.NULL);
            call.resolve(out);
            return;
        }
        try (InputStream in = new FileInputStream(latest);
             OutputStream os = getContext().getContentResolver().openOutputStream(uri)) {
            if (os == null) throw new java.io.IOException("sin destino");
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) > 0) os.write(buffer, 0, n);
            out.put("saved", true);
            out.put("name", latest.getName());
            call.resolve(out);
        } catch (Exception e) {
            call.reject("No se pudo exportar el registro", BridgeErrors.EXPORT_FAILED);
        }
    }

    // ---------------------------------------------------------------- utilidades

    private static JSObject toJs(Map<String, Object> map) {
        JSObject js = new JSObject();
        for (Map.Entry<String, Object> e : map.entrySet()) js.put(e.getKey(), e.getValue() == null ? JSObject.NULL : e.getValue());
        return js;
    }
}
