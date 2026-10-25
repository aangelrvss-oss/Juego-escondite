package app.theoutrun.diag;

import android.os.Bundle;
import app.theoutrun.location.OutrunLocationPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Módulo nativo de ubicación propio (contrato: mobile/contract/location-bridge.json).
        registerPlugin(OutrunLocationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
