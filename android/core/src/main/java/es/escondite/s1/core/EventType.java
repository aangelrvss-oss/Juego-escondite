package es.escondite.s1.core;

/** Eventos de la sesión. El detalle asociado nunca contiene coordenadas. */
public enum EventType {
    SESSION_START,
    SESSION_STOP,
    PERMISSION_STATE,
    PROVIDER_ENABLED,
    PROVIDER_DISABLED,
    SCREEN_ON,
    SCREEN_OFF,
    APP_VISIBLE,
    APP_HIDDEN,
    POWER_SAVE_ON,
    POWER_SAVE_OFF,
    DEVICE_IDLE_ON,
    DEVICE_IDLE_OFF,
    GAP_START,
    GAP_END,
    ANCHOR_SET,
    HEARTBEAT,
    TEST_NOTIFICATION_POSTED,
    TASK_REMOVED,
    SERVICE_DESTROYED,
    ABNORMAL_END_DETECTED,
    ERROR
}
