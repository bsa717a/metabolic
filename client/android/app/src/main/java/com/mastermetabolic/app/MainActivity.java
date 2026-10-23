package com.mastermetabolic.app;

import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Injects Google tokens saved by the patched Android auth handler.
 * Same localStorage key and event as the iOS SceneDelegate handoff.
 */
public class MainActivity extends BridgeActivity {
    static final String PREFS = "metabolic.nativeAuth";
    static final String PENDING_GOOGLE_KEY = "metabolic.pendingGoogleAuth";

    @Override
    public void onResume() {
        super.onResume();
        injectPendingGoogleAuth();
    }

    private void injectPendingGoogleAuth() {
        Bridge bridge = getBridge();
        if (bridge == null) {
            return;
        }
        WebView webView = bridge.getWebView();
        if (webView == null) {
            return;
        }
        String json = getSharedPreferences(PREFS, MODE_PRIVATE).getString(PENDING_GOOGLE_KEY, null);
        if (json == null || json.isEmpty()) {
            return;
        }
        String escaped = json.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "");
        String js =
            "try { window.localStorage.setItem('metabolic.pendingGoogleAuth', '" +
            escaped +
            "'); window.dispatchEvent(new Event('metabolic-pending-google-auth')); } catch (e) {}";
        webView.evaluateJavascript(js, result ->
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(PENDING_GOOGLE_KEY).apply()
        );
    }
}
