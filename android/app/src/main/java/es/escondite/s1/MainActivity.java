package es.escondite.s1;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.Location;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import es.escondite.s1.core.LiveReading;
import es.escondite.s1.core.PermissionState;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** Pantalla única de la prueba S1. Interfaz mínima, sin recursos propios. */
public final class MainActivity extends Activity {

    private static final int REQ_LOCATION = 1;
    private static final int REQ_NOTIFICATIONS = 2;
    private static final int REQ_EXPORT = 3;
    private static final String PREF_DENIED_PERMANENTLY = "location_denied_permanently";

    private static final String CONSENT_TEXT =
            "Prueba técnica S1. Esta app mide si el móvil entrega ubicaciones con la pantalla bloqueada.\n\n"
            + "• Guarda en el propio móvil: hora, antigüedad y precisión de cada lectura, huecos, estado de "
            + "pantalla y batería. NO guarda coordenadas.\n"
            + "• Si marcas un punto de referencia, guarda solo la distancia a ese punto; el punto se olvida al parar.\n"
            + "• No tiene permiso de Internet: no envía nada. Solo tú puedes exportar el archivo.\n"
            + "• Puedes borrar todas las sesiones desde esta pantalla.";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView status;
    private TextView live;
    private Button permissionSettings;
    private TextView notice;
    private CheckBox consent;
    private CheckBox testNotifications;
    private Button start;

    private final Runnable refresher = new Runnable() {
        @Override
        public void run() {
            refresh();
            handler.postDelayed(this, 1_000);
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (16 * getResources().getDisplayMetrics().density);
        root.setPadding(pad, pad, pad, pad);

        TextView consentText = new TextView(this);
        consentText.setText(CONSENT_TEXT);
        root.addView(consentText);

        SharedPreferences prefs = SessionStore.prefs(this);
        consent = new CheckBox(this);
        consent.setText("Entiendo qué se registra y acepto hacer la prueba");
        consent.setChecked(prefs.getBoolean("consent", false));
        consent.setOnCheckedChangeListener((v, checked) -> prefs.edit().putBoolean("consent", checked).apply());
        root.addView(consent);

        notice = new TextView(this);
        root.addView(notice);
        live = new TextView(this);
        live.setTextSize(17);
        live.setPadding(0, pad / 2, 0, pad / 2);
        root.addView(live);
        permissionSettings = button("Abrir ajustes para permitir la ubicación", v -> openAppSettings());
        permissionSettings.setVisibility(View.GONE);
        root.addView(permissionSettings);
        status = new TextView(this);
        status.setPadding(0, pad / 2, 0, pad / 2);
        root.addView(status);

        root.addView(button("1. Permiso de ubicación (precisa)", v -> requestPermissions(
                new String[] {Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                REQ_LOCATION)));
        root.addView(button("2. Permiso de notificaciones", v -> requestPermissions(
                new String[] {Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS)));
        root.addView(button("3. Ajustes de la app (batería sin restricciones)", v -> openAppSettings()));

        testNotifications = new CheckBox(this);
        testNotifications.setText("Avisos de prueba cada 2 min (alternan vibración y sonido)");
        root.addView(testNotifications);

        start = button("Iniciar sesión de prueba", v -> startSession());
        root.addView(start);
        root.addView(button("Marcar referencia (quieto en un punto conocido)", v -> sendToService(LocationTestService.ACTION_SET_ANCHOR)));
        root.addView(button("Detener sesión", v -> sendToService(LocationTestService.ACTION_STOP)));
        root.addView(button("Exportar la última sesión (CSV)", v -> exportLatest()));
        root.addView(button("Borrar todas las sesiones", v -> {
            int n = SessionStore.deleteAll(this);
            notice.setText("Sesiones borradas: " + n);
        }));

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        setContentView(scroll);

        String abnormal = SessionStore.detectAbnormalEnd(this, LocationTestService.running);
        if (abnormal != null) notice.setText(abnormal);
    }

    private Button button(String text, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setText(text);
        b.setAllCaps(false);
        b.setOnClickListener(onClick);
        return b;
    }

    private void openAppSettings() {
        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
    }

    @Override
    protected void onStart() {
        super.onStart();
        LocationTestService.appVisible = true;
    }

    // El panel solo se actualiza con la pantalla en primer plano; al salir se borran las coordenadas.
    @Override
    protected void onResume() {
        super.onResume();
        handler.post(refresher);
    }

    @Override
    protected void onPause() {
        handler.removeCallbacks(refresher);
        live.setText("");
        super.onPause();
    }

    @Override
    protected void onStop() {
        LocationTestService.appVisible = false;
        super.onStop();
    }

    private void startSession() {
        if (!consent.isChecked()) {
            notice.setText("Marca primero la casilla de consentimiento.");
            return;
        }
        if (!hasLocationPermission()) {
            notice.setText("Falta el permiso de ubicación (botón 1).");
            return;
        }
        Intent intent = new Intent(this, LocationTestService.class)
                .setAction(LocationTestService.ACTION_START)
                .putExtra(LocationTestService.EXTRA_TEST_NOTIFICATIONS, testNotifications.isChecked());
        startForegroundService(intent);
        notice.setText("Sesión iniciada. Puedes bloquear la pantalla.");
    }

    private void sendToService(String action) {
        if (!LocationTestService.running) {
            notice.setText("No hay ninguna sesión en marcha.");
            return;
        }
        startService(new Intent(this, LocationTestService.class).setAction(action));
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void refresh() {
        boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean notifications = checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        LocationManager lm = getSystemService(LocationManager.class);
        PowerManager pm = getSystemService(PowerManager.class);
        File latest = SessionStore.latest(this);
        SharedPreferences prefs = SessionStore.prefs(this);
        // Si ahora está concedido (p. ej., desde los ajustes), se olvida la denegación anterior.
        if ((fine || coarse) && prefs.getBoolean(PREF_DENIED_PERMANENTLY, false)) {
            prefs.edit().putBoolean(PREF_DENIED_PERMANENTLY, false).apply();
        }
        PermissionState permission = PermissionState.classify(fine, coarse, prefs.getBoolean(PREF_DENIED_PERMANENTLY, false));
        permissionSettings.setVisibility(permission == PermissionState.DENIED_PERMANENTLY ? View.VISIBLE : View.GONE);
        renderLive(lm.isLocationEnabled());
        status.setText("Permiso de ubicación: " + permission.label
                + "\nNotificaciones: " + (notifications ? "permitidas" : "no permitidas")
                + "\nUbicación del sistema: " + (lm.isLocationEnabled() ? "activada" : "DESACTIVADA")
                + "\nAhorro de batería: " + (pm.isPowerSaveMode() ? "ACTIVADO" : "desactivado")
                + "\nBatería sin restricciones para esta app: " + (DeviceStateReader.ignoringBatteryOptimizations(this) ? "sí" : "no")
                + "\nServicio: " + (LocationTestService.running ? "en marcha" : "parado")
                + "\n" + LocationTestService.statusLine
                + "\nSesiones guardadas: " + SessionStore.sessions(this).length
                + (latest == null ? "" : " (última: " + latest.getName() + ")"));
        start.setEnabled(!LocationTestService.running);
    }

    /** Panel "Lectura actual". Frescura y precisión se muestran por separado; nada se inventa ni se guarda. */
    private void renderLive(boolean systemLocationOn) {
        Location loc = LocationTestService.running ? LocationTestService.latest : null;
        long ageMs = loc == null ? -1
                : Math.max(0, (SystemClock.elapsedRealtimeNanos() - loc.getElapsedRealtimeNanos()) / 1_000_000L);
        LiveReading.Freshness freshness = LiveReading.freshness(ageMs);
        float accuracyM = loc != null && loc.hasAccuracy() ? loc.getAccuracy() : Float.NaN;
        StringBuilder sb = new StringBuilder("LECTURA ACTUAL (solo en pantalla, no se guarda)\n");
        if (!systemLocationOn) sb.append("⚠ La ubicación del sistema está DESACTIVADA.\n");
        sb.append("Frescura: ").append(freshness.label);
        if (freshness == LiveReading.Freshness.OLD) sb.append(" (no es tu posición actual)");
        if (loc == null) {
            sb.append("\nPrecisión: ").append(LiveReading.Accuracy.UNKNOWN.label)
                    .append(LocationTestService.running
                            ? "\nEsperando la primera posición del sistema…"
                            : "\nInicia la sesión de prueba para recibir posiciones.");
            live.setTextColor(Color.GRAY);
        } else {
            sb.append("\nPrecisión: ").append(LiveReading.accuracy(accuracyM).label)
                    .append(freshness == LiveReading.Freshness.OLD ? "\nÚltima posición recibida:" : "\nPosición:")
                    .append("\n  Latitud ").append(LiveReading.formatCoordinate(loc.getLatitude()))
                    .append("\n  Longitud ").append(LiveReading.formatCoordinate(loc.getLongitude()))
                    .append("\nPrecisión estimada por el sistema: ")
                    .append(Float.isNaN(accuracyM) ? "no disponible" : "±" + Math.round(accuracyM) + " m (estimación, no garantía)")
                    .append("\nAntigüedad: ").append(LiveReading.formatAge(ageMs))
                    .append("\nProveedor: ").append(loc.getProvider() == null ? "no disponible" : loc.getProvider());
            if (loc.isMock()) sb.append("\n⚠ Posición simulada por otra app (ubicación ficticia activada).");
            live.setTextColor(freshness == LiveReading.Freshness.UPDATED ? Color.rgb(0, 120, 60) : Color.rgb(190, 90, 0));
        }
        live.setText(sb.toString());
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        // Sin resultados = diálogo cancelado: no se deduce nada.
        if (requestCode == REQ_LOCATION && grantResults.length > 0) {
            boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            boolean coarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            boolean permanent = PermissionState.deniedPermanentlyAfterResult(fine, coarse,
                    shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION));
            SessionStore.prefs(this).edit().putBoolean(PREF_DENIED_PERMANENTLY, permanent).apply();
        }
        refresh();
    }

    // Exporta con el selector de archivos del sistema: sin permisos de almacenamiento ni bibliotecas.
    private void exportLatest() {
        File latest = SessionStore.latest(this);
        if (latest == null) {
            notice.setText("No hay sesiones que exportar.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("text/csv")
                .putExtra(Intent.EXTRA_TITLE, latest.getName());
        startActivityForResult(intent, REQ_EXPORT);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_EXPORT || resultCode != RESULT_OK || data == null || data.getData() == null) return;
        File latest = SessionStore.latest(this);
        if (latest == null) return;
        try (InputStream in = new FileInputStream(latest);
             OutputStream out = getContentResolver().openOutputStream(data.getData())) {
            if (out == null) throw new IOException("sin destino");
            byte[] buffer = new byte[8192];
            int n;
            while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
            notice.setText("Exportada: " + latest.getName());
        } catch (IOException e) {
            notice.setText("No se pudo exportar: " + e.getMessage());
        }
    }
}
