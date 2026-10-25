package app.theoutrun.location;

import java.util.List;

/** Códigos de error del contrato (mobile/contract/location-bridge.json). Los mismos en iOS. */
public final class BridgeErrors {
    private BridgeErrors() {}

    public static final String PERMISSION_MISSING = "permission_missing";
    public static final String PROVIDER_DISABLED = "provider_disabled";
    public static final String SERVICE_START_DENIED = "service_start_denied";
    public static final String SESSION_FILE_ERROR = "session_file_error";
    public static final String REQUEST_UPDATES_DENIED = "request_updates_denied";
    public static final String ALREADY_RUNNING = "already_running";
    public static final String NOT_RUNNING = "not_running";
    public static final String INVALID_INTERVAL = "invalid_interval";
    public static final String NO_SESSION = "no_session";
    public static final String EXPORT_CANCELLED = "export_cancelled";
    public static final String EXPORT_FAILED = "export_failed";
    public static final String SERVICE_DESTROYED = "service_destroyed";
    public static final String ABNORMAL_END = "abnormal_end";

    public static final List<String> ALL = List.of(
            PERMISSION_MISSING, PROVIDER_DISABLED, SERVICE_START_DENIED, SESSION_FILE_ERROR,
            REQUEST_UPDATES_DENIED, ALREADY_RUNNING, NOT_RUNNING, INVALID_INTERVAL, NO_SESSION,
            EXPORT_CANCELLED, EXPORT_FAILED, SERVICE_DESTROYED, ABNORMAL_END);
}
