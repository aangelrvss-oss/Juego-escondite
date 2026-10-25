package app.theoutrun.location;

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
import es.escondite.s1.core.SessionRecorder;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Servicio en primer plano de tipo ubicación, adaptado de S1 (LocationTestService).
 * - Permiso «mientras se usa la app»: se inicia SOLO desde la app visible (Android 14 no deja
 *   iniciarlo desde segundo plano sin el permiso de ubicación en segundo plano, que H1 no pide).
 * - Proveedor de la plataforma: LocationManager.FUSED_PROVIDER (Android 12+, sin Google Play
 *   Services); si el dispositivo no lo tiene, GPS_PROVIDER.
 * - Notificación persistente mientras recopila, con botón «Detener».
 * - Registra calidad, antigüedad y huecos con el núcleo de S1 (CSV SIN coordenadas). Las
 *   coordenadas solo viajan a la pantalla, en memoria.
 * No promete continuidad: Android puede limitar o detener el servicio; la sesión lo registra.
 */
public final class LocationSessionService extends Service {

    public static final String ACTION_START = "app.theoutrun.location.START";
    public static final String ACTION_STOP = "app.theoutrun.location.STOP";
    public static final String EXTRA_INTERVAL_MS = "interval_ms";

    static final String CHANNEL = "outrun_location";
    private static final int NOTIFICATION_ID = 41;
    private static final long TICK_MS = 5_000;

    /** Receptor de lecturas y cambios de estado (el plugin, en el mismo proceso). */
    public interface Listener {
        void onReading(Map<String, Object> reading);

        void onStatus(Map<String, Object> status);
    }

    private static volatile Listener listener;
    // Estado para el puente (mismo proceso). Nunca contiene coordenadas.
    private static volatile boolean running;
    private static volatile String sessionId;
    private static volatile long intervalMs = SessionConfig.DEFAULT_INTERVAL_MS;
    private static volatile String activeProvider;
    private static volatile String lastError;
    private static volatile int fixes;
    private static volatile int gaps;
    private static volatile boolean gapOpen;
    static volatile boolean appVisible;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private LocationManager locationManager;
    private SessionRecorder recorder;
    private BufferedWriter writer;
    private long lastHeartbeatElapsed;
    private boolean lastAppVisible;

    public static void setListener(Listener l) {
        listener = l;
    }

    public static boolean isRunning() {
        return running;
    }

    public static Map<String, Object> status(String message) {
        return Payloads.status(running, sessionId, intervalMs, fixes, gaps, gapOpen, activeProvider, lastError, message);
    }

    /** Proveedor que usará la sesión: el fusionado de la plataforma si existe; si no, el GPS. */
    public static String chooseProvider(LocationManager lm) {
        return lm.hasProvider(LocationManager.FUSED_PROVIDER) ? LocationManager.FUSED_PROVIDER : LocationManager.GPS_PROVIDER;
    }

    private static void publishStatus() {
        Listener l = listener;
        if (l != null) l.onStatus(status(null));
    }

    private final LocationListener locationListener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            onFix(location);
        }

        @Override
        public void onProviderEnabled(String name) {
            event(EventType.PROVIDER_ENABLED, "provider=" + name);
            if (BridgeErrors.PROVIDER_DISABLED.equals(lastError)) lastError = null;
            publishStatus();
        }

        @Override
        public void onProviderDisabled(String name) {
            event(EventType.PROVIDER_DISABLED, "provider=" + name);
            lastError = BridgeErrors.PROVIDER_DISABLED;
            publishStatus();
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
                SessionStore.heartbeat(LocationSessionService.this);
                event(EventType.HEARTBEAT, "fixes=" + recorder.fixes() + " gaps=" + recorder.gaps());
            }
            refreshCounters();
            publishStatus();
            handler.postDelayed(this, TICK_MS);
        }
    };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_START.equals(action)) {
            long requested = intent.getLongExtra(EXTRA_INTERVAL_MS, SessionConfig.DEFAULT_INTERVAL_MS);
            start(SessionConfig.isValidInterval(requested) ? requested : SessionConfig.DEFAULT_INTERVAL_MS);
        } else if (ACTION_STOP.equals(action)) {
            stop();
        }
        // Sin reinicio automático: Android 14 no deja arrancar un servicio de ubicación en primer
        // plano desde segundo plano sin el permiso de ubicación en segundo plano.
        return START_NOT_STICKY;
    }

    private void fail(String code) {
        lastError = code;
        running = false;
        publishStatus();
        stopSelf();
    }

    private void start(long requestedIntervalMs) {
        if (running) {
            publishStatus(); // evita servicios o sesiones duplicados
            return;
        }
        lastError = null;
        boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) {
            fail(BridgeErrors.PERMISSION_MISSING);
            return;
        }
        createChannel();
        try {
            startForeground(NOTIFICATION_ID, serviceNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } catch (RuntimeException e) {
            // SecurityException o ForegroundServiceStartNotAllowedException.
            fail(BridgeErrors.SERVICE_START_DENIED);
            return;
        }
        File file = SessionStore.newSessionFile(this);
        try {
            writer = new BufferedWriter(new FileWriter(file));
        } catch (IOException e) {
            stopForeground(STOP_FOREGROUND_REMOVE);
            fail(BridgeErrors.SESSION_FILE_ERROR);
            return;
        }
        locationManager = getSystemService(LocationManager.class);
        activeProvider = chooseProvider(locationManager);
        intervalMs = requestedIntervalMs;
        sessionId = UUID.randomUUID().toString();
        long now = SystemClock.elapsedRealtime();
        lastHeartbeatElapsed = now;
        lastAppVisible = appVisible;
        String detail = String.format(Locale.ROOT, "app=outrun-h1 provider=%s interval_ms=%d sdk=%d device=%s_%s precise=%s",
                activeProvider, intervalMs, Build.VERSION.SDK_INT, Build.MANUFACTURER, Build.MODEL, fine).replace(' ', ';');
        recorder = new SessionRecorder(this::writeLine, now, System.currentTimeMillis(), detail, state());
        running = true;
        fixes = 0;
        gaps = 0;
        gapOpen = false;
        SessionStore.markRunning(this, file);
        event(EventType.PERMISSION_STATE, permissionDetail(fine, coarse));

        LocationRequest request = new LocationRequest.Builder(intervalMs)
                .setQuality(LocationRequest.QUALITY_HIGH_ACCURACY)
                .setMinUpdateIntervalMillis(intervalMs)
                .build();
        try {
            locationManager.requestLocationUpdates(activeProvider, request, getMainExecutor(), locationListener);
        } catch (SecurityException | IllegalArgumentException e) {
            event(EventType.ERROR, "request_updates_denied");
            lastError = BridgeErrors.REQUEST_UPDATES_DENIED;
            stop();
            return;
        }
        if (!locationManager.isLocationEnabled()) lastError = BridgeErrors.PROVIDER_DISABLED;

        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_SCREEN_OFF);
        filter.addAction(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED);
        filter.addAction(PowerManager.ACTION_DEVICE_IDLE_MODE_CHANGED);
        registerReceiver(systemReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        handler.post(tick);
        publishStatus();
    }

    private void stop() {
        if (running) {
            event(EventType.SESSION_STOP, "fixes=" + recorder.fixes() + " gaps=" + recorder.gaps());
            shutdown();
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
        publishStatus();
        stopSelf();
    }

    private void shutdown() {
        refreshCounters();
        running = false;
        handler.removeCallbacks(tick);
        if (locationManager != null) locationManager.removeUpdates(locationListener);
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
        SessionStore.markStopped(this);
    }

    private void onFix(Location location) {
        if (!running) return;
        long receivedElapsed = SystemClock.elapsedRealtime();
        long fixElapsed = location.getElapsedRealtimeNanos() / 1_000_000L;
        float accuracy = location.hasAccuracy() ? location.getAccuracy() : Float.NaN;
        float speed = location.hasSpeed() ? location.getSpeed() : Float.NaN;
        String provider = location.getProvider() == null ? activeProvider : location.getProvider();
        recorder.fix(new FixSample(receivedElapsed, fixElapsed, System.currentTimeMillis(), provider, accuracy, speed,
                location.isMock(), null, state()));
        refreshCounters();
        Listener l = listener;
        if (l != null) {
            l.onReading(Payloads.reading(sessionId, location.getLatitude(), location.getLongitude(), accuracy,
                    receivedElapsed - fixElapsed, System.currentTimeMillis(), location.getTime(), provider,
                    location.isMock(), speed));
        }
    }

    private void refreshCounters() {
        if (recorder == null) return;
        fixes = recorder.fixes();
        gaps = recorder.gaps();
        gapOpen = recorder.gapOpen();
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
            lastError = BridgeErrors.SESSION_FILE_ERROR;
        }
    }

    private String permissionDetail(boolean fine, boolean coarse) {
        boolean notifications = Build.VERSION.SDK_INT < PermissionMapper.NOTIFICATIONS_RUNTIME_SDK
                || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        return "fine=" + fine + " coarse=" + coarse + " notifications=" + notifications
                + " battery_unrestricted=" + DeviceStateReader.ignoringBatteryOptimizations(this);
    }

    private void createChannel() {
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Ubicación en uso (diagnóstico GPS)", NotificationManager.IMPORTANCE_LOW);
        channel.setShowBadge(false);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private Notification serviceNotification() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent open = launch == null ? null : PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE);
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, LocationSessionService.class).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentTitle("THE OUTRUN está usando tu ubicación")
                .setContentText("Sesión de diagnóstico GPS en curso. No se envía ni se guardan coordenadas.")
                .setOngoing(true)
                .setContentIntent(open)
                .addAction(new Notification.Action.Builder(null, "Detener", stop).build())
                .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
                .build();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        event(EventType.TASK_REMOVED, "");
    }

    @Override
    public void onDestroy() {
        if (running) {
            event(EventType.SERVICE_DESTROYED, "not_stopped_by_user");
            lastError = BridgeErrors.SERVICE_DESTROYED;
            shutdown();
            publishStatus();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
