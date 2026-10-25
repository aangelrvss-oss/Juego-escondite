package es.escondite.s1;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.location.LocationRequest;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import es.escondite.s1.core.DeviceState;
import es.escondite.s1.core.EventType;
import es.escondite.s1.core.ExperimentalParams;
import es.escondite.s1.core.FixSample;
import es.escondite.s1.core.Geo;
import es.escondite.s1.core.SessionRecorder;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.Locale;

/**
 * Servicio en primer plano de tipo ubicación (variante V2: permiso "mientras se usa la app").
 * Se inicia SOLO desde la pantalla visible, como exige Android 14 sin ubicación en segundo plano.
 * Registra calidad, antigüedad y huecos de las posiciones. Nunca guarda coordenadas.
 */
public final class LocationTestService extends Service {

    static final String ACTION_START = "es.escondite.s1.START";
    static final String ACTION_STOP = "es.escondite.s1.STOP";
    static final String ACTION_SET_ANCHOR = "es.escondite.s1.SET_ANCHOR";
    static final String EXTRA_TEST_NOTIFICATIONS = "test_notifications";

    static final String CHANNEL_SERVICE = "s1_service";
    static final String CHANNEL_VIBRATE = "s1_test_vibrate";
    static final String CHANNEL_SOUND = "s1_test_sound";
    private static final int NOTIFICATION_ID = 1;
    private static final long TICK_MS = 5_000;

    // Estado para la pantalla (mismo proceso). Nunca contiene coordenadas.
    static volatile boolean running;
    static volatile boolean appVisible;
    static volatile String statusLine = "Sin sesión";
    // Última posición para el panel "Lectura actual": SOLO en memoria, nunca en el CSV.
    // Se borra al detener la sesión.
    static volatile Location latest;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private LocationManager locationManager;
    private SessionRecorder recorder;
    private BufferedWriter writer;
    private String provider;
    private boolean testNotifications;
    private long lastTestNotificationElapsed;
    private int testNotificationCount;
    private long lastHeartbeatElapsed;
    private boolean lastAppVisible;

    // Punto de referencia: SOLO en memoria, para medir la deriva estando quieto. Se pierde al parar.
    private boolean anchorPending;
    private double anchorLat = Double.NaN;
    private double anchorLng = Double.NaN;

    private final LocationListener listener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            onFix(location);
        }

        @Override
        public void onProviderEnabled(String name) {
            event(EventType.PROVIDER_ENABLED, "provider=" + name);
        }

        @Override
        public void onProviderDisabled(String name) {
            event(EventType.PROVIDER_DISABLED, "provider=" + name);
        }
    };

    private final BroadcastReceiver systemReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String action = intent.getAction();
            if (Intent.ACTION_SCREEN_ON.equals(action)) {
                event(EventType.SCREEN_ON, "");
            } else if (Intent.ACTION_SCREEN_OFF.equals(action)) {
                event(EventType.SCREEN_OFF, "");
            } else if (PowerManager.ACTION_POWER_SAVE_MODE_CHANGED.equals(action)) {
                boolean on = getSystemService(PowerManager.class).isPowerSaveMode();
                event(on ? EventType.POWER_SAVE_ON : EventType.POWER_SAVE_OFF, "");
            } else if (PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED.equals(action)) {
                boolean idle = getSystemService(PowerManager.class).isDeviceIdleMode();
                event(idle ? EventType.DEVICE_IDLE_ON : EventType.DEVICE_IDLE_OFF, "");
            }
        }
    };

    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            long now = SystemClock.elapsedRealtime();
            recorder.tick(now, System.currentTimeMillis(), state());
            if (appVisible != lastAppVisible) {
                lastAppVisible = appVisible;
                event(appVisible ? EventType.APP_VISIBLE : EventType.APP_HIDDEN, "");
            }
            if (now - lastHeartbeatElapsed >= ExperimentalParams.HEARTBEAT_MS) {
                lastHeartbeatElapsed = now;
                SessionStore.heartbeat(LocationTestService.this);
                event(EventType.HEARTBEAT, "fixes=" + recorder.fixes() + " gaps=" + recorder.gaps());
            }
            if (testNotifications && now - lastTestNotificationElapsed >= ExperimentalParams.TEST_NOTIFICATION_INTERVAL_MS) {
                lastTestNotificationElapsed = now;
                postTestNotification();
            }
            updateStatus(now);
            handler.postDelayed(this, TICK_MS);
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_START.equals(action)) {
            start(intent.getBooleanExtra(EXTRA_TEST_NOTIFICATIONS, false));
        } else if (ACTION_STOP.equals(action)) {
            stop();
        } else if (ACTION_SET_ANCHOR.equals(action) && running) {
            anchorPending = true;
        }
        // Sin reinicio automático: Android 14 no deja arrancar un servicio de ubicación en primer
        // plano desde segundo plano sin el permiso de ubicación en segundo plano.
        return START_NOT_STICKY;
    }

    private void start(boolean withTestNotifications) {
        if (running) return;
        boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) {
            statusLine = "No se puede iniciar: falta el permiso de ubicación";
            stopSelf();
            return;
        }
        createChannels();
        try {
            startForeground(NOTIFICATION_ID, serviceNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } catch (RuntimeException e) {
            // SecurityException o ForegroundServiceStartNotAllowedException: se informa y se para.
            statusLine = "Android no permitió iniciar el servicio: " + e.getClass().getSimpleName();
            stopSelf();
            return;
        }

        File file = SessionStore.newSessionFile(this);
        try {
            writer = new BufferedWriter(new FileWriter(file));
        } catch (IOException e) {
            statusLine = "No se pudo crear el archivo de sesión";
            stopForeground(STOP_FOREGROUND_REMOVE);
            stopSelf();
            return;
        }
        locationManager = getSystemService(LocationManager.class);
        provider = locationManager.hasProvider(LocationManager.FUSED_PROVIDER)
                ? LocationManager.FUSED_PROVIDER
                : LocationManager.GPS_PROVIDER;
        testNotifications = withTestNotifications;
        long now = SystemClock.elapsedRealtime();
        lastHeartbeatElapsed = now;
        lastTestNotificationElapsed = now;
        lastAppVisible = appVisible;
        String detail = String.format(Locale.ROOT, "provider=%s interval_ms=%d sdk=%d device=%s_%s precise=%s test_notifications=%s",
                provider, ExperimentalParams.REQUEST_INTERVAL_MS, Build.VERSION.SDK_INT,
                Build.MANUFACTURER, Build.MODEL, fine, withTestNotifications).replace(' ', ';');
        recorder = new SessionRecorder(this::writeLine, now, System.currentTimeMillis(), detail, state());
        running = true;
        SessionStore.markRunning(this, file);
        event(EventType.PERMISSION_STATE, permissionDetail(fine, coarse));

        LocationRequest request = new LocationRequest.Builder(ExperimentalParams.REQUEST_INTERVAL_MS)
                .setQuality(LocationRequest.QUALITY_HIGH_ACCURACY)
                .setMinUpdateIntervalMillis(ExperimentalParams.REQUEST_INTERVAL_MS)
                .build();
        try {
            locationManager.requestLocationUpdates(provider, request, getMainExecutor(), listener);
        } catch (SecurityException e) {
            event(EventType.ERROR, "request_updates_denied");
            stop();
            return;
        }

        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        filter.addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED);
        filter.addAction(PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED);
        registerReceiver(systemReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        handler.post(tick);
    }

    private void stop() {
        if (!running) {
            stopSelf();
            return;
        }
        event(EventType.SESSION_STOP, "fixes=" + recorder.fixes() + " gaps=" + recorder.gaps());
        shutdown();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void shutdown() {
        running = false;
        latest = null;
        handler.removeCallbacks(tick);
        if (locationManager != null) locationManager.removeUpdates(listener);
        try {
            unregisterReceiver(systemReceiver);
        } catch (IllegalArgumentException ignored) {
            // No llegó a registrarse.
        }
        try {
            if (writer != null) writer.close();
        } catch (IOException ignored) {
            // Se pierde como mucho la última línea.
        }
        writer = null;
        anchorLat = Double.NaN;
        anchorLng = Double.NaN;
        SessionStore.markStopped(this);
        statusLine = "Sesión detenida";
    }

    private void onFix(Location location) {
        if (!running) return;
        latest = location;
        long received = SystemClock.elapsedRealtime();
        if (anchorPending) {
            anchorPending = false;
            anchorLat = location.getLatitude();
            anchorLng = location.getLongitude();
            event(EventType.ANCHOR_SET, "accuracy_m=" + Math.round(location.getAccuracy()));
        }
        Double anchorDistance = Double.isNaN(anchorLat) ? null
                : Geo.distanceM(anchorLat, anchorLng, location.getLatitude(), location.getLongitude());
        recorder.fix(new FixSample(
                received,
                location.getElapsedRealtimeNanos() / 1_000_000L,
                System.currentTimeMillis(),
                location.getProvider() == null ? provider : location.getProvider(),
                location.hasAccuracy() ? location.getAccuracy() : Float.NaN,
                location.hasSpeed() ? location.getSpeed() : Float.NaN,
                location.isMock(),
                anchorDistance,
                state()));
        updateStatus(received);
    }

    private void event(EventType type, String detail) {
        if (!running || recorder == null) return;
        recorder.event(type, detail, SystemClock.elapsedRealtime(), System.currentTimeMillis(), state());
    }

    private DeviceState state() {
        return DeviceStateReader.read(this, appVisible);
    }

    private void writeLine(String line) {
        if (writer == null) return;
        try {
            writer.write(line);
            writer.write('\n');
            writer.flush();
        } catch (IOException e) {
            statusLine = "Error al escribir el archivo de sesión";
        }
    }

    private void updateStatus(long now) {
        long since = recorder.msSinceLastFix(now);
        statusLine = String.format(Locale.ROOT,
                "Muestras: %d · huecos: %d%s · última hace %s · antigüedad al recibir %s · precisión %s · %s",
                recorder.fixes(), recorder.gaps(), recorder.gapOpen() ? " (hueco abierto)" : "",
                since < 0 ? "—" : (since / 1000) + " s",
                recorder.lastAgeMs() < 0 ? "—" : recorder.lastAgeMs() + " ms",
                Float.isNaN(recorder.lastAccuracyM()) ? "—" : Math.round(recorder.lastAccuracyM()) + " m",
                recorder.lastAvailability());
    }

    private String permissionDetail(boolean fine, boolean coarse) {
        boolean notifications = checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        return "fine=" + fine + " coarse=" + coarse + " notifications=" + notifications
                + " battery_unrestricted=" + DeviceStateReader.ignoringBatteryOptimizations(this);
    }

    private void createChannels() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        NotificationChannel service = new NotificationChannel(CHANNEL_SERVICE, "Prueba S1 en curso", NotificationManager.IMPORTANCE_LOW);
        service.setShowBadge(false);

        NotificationChannel vibrate = new NotificationChannel(CHANNEL_VIBRATE, "Aviso de prueba: vibración", NotificationManager.IMPORTANCE_HIGH);
        vibrate.setSound(null, null);
        vibrate.enableVibration(true);
        vibrate.setVibrationPattern(new long[] {0, 400, 200, 400});

        NotificationChannel sound = new NotificationChannel(CHANNEL_SOUND, "Aviso de prueba: sonido", NotificationManager.IMPORTANCE_HIGH);
        sound.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
        sound.enableVibration(true);

        nm.createNotificationChannel(service);
        nm.createNotificationChannel(vibrate);
        nm.createNotificationChannel(sound);
    }

    private Notification serviceNotification() {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL_SERVICE)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("Prueba S1 en curso")
                .setContentText("Midiendo la calidad de la ubicación. No se guardan coordenadas.")
                .setOngoing(true)
                .setContentIntent(open)
                .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }

    // D-036: alterna un aviso solo con vibración y otro con sonido. Quien prueba anota si los percibe.
    private void postTestNotification() {
        testNotificationCount++;
        boolean withSound = testNotificationCount % 2 == 0;
        String channel = withSound ? CHANNEL_SOUND : CHANNEL_VIBRATE;
        Notification n = new Notification.Builder(this, channel)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Aviso de prueba " + testNotificationCount + (withSound ? " (sonido)" : " (vibración)"))
                .setContentText("Anota si lo has notado con la pantalla bloqueada.")
                .setAutoCancel(true)
                .build();
        getSystemService(NotificationManager.class).notify(100 + testNotificationCount, n);
        event(EventType.TEST_NOTIFICATION_POSTED, "n=" + testNotificationCount + " channel=" + (withSound ? "sound" : "vibrate"));
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        event(EventType.TASK_REMOVED, "");
    }

    @Override
    public void onDestroy() {
        if (running) {
            event(EventType.SERVICE_DESTROYED, "not_stopped_by_user");
            shutdown();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
