package __PACKAGE__;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin propio: debe registrarse antes de super.onCreate().
        registerPlugin(NotificationCapturePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
