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
    static final String PENDING_APPLE_KEY = "metabolic.pendingAppleAuth";
    static final String PENDING_APPLE_NONCE_KEY = "metabolic.pendingAppleNonce";

    @Override
    public void onResume() {
        super.onResume();
        injectPendingGoogleAuth();
        injectPendingAppleAuth();
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
        // Return true only after the token is stored on the app origin. iOS
        // SceneDelegate clears UserDefaults only when evaluateJavaScript reports
        // error == nil. A false or null result leaves the preference so the next
        // onResume can try again.
        String js =
            "(function () {" +
            " try {" +
            " if (window.location.origin !== 'https://metaos.mastermetabolic.com') return false;" +
            " window.localStorage.setItem('metabolic.pendingGoogleAuth', '" +
            escaped +
            "');" +
            " window.dispatchEvent(new Event('metabolic-pending-google-auth'));" +
            " return true;" +
            " } catch (e) { return false; }" +
            "})()";
        webView.evaluateJavascript(js, result -> {
            if (!"true".equals(result)) {
                return;
            }
            getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(PENDING_GOOGLE_KEY).apply();
        });
    }

    private void injectPendingAppleAuth() {
        Bridge bridge = getBridge();
        if (bridge == null) {
            return;
        }
        WebView webView = bridge.getWebView();
        if (webView == null) {
            return;
        }
        String json = getSharedPreferences(PREFS, MODE_PRIVATE).getString(PENDING_APPLE_KEY, null);
        if (json == null || json.isEmpty()) {
            return;
        }
        String escaped = json.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "");
        String js =
            "(function () {" +
            " try {" +
            " if (window.location.origin !== 'https://metaos.mastermetabolic.com') return false;" +
            " window.localStorage.setItem('metabolic.pendingAppleAuth', '" +
            escaped +
            "');" +
            " window.dispatchEvent(new Event('metabolic-pending-apple-auth'));" +
            " return true;" +
            " } catch (e) { return false; }" +
            "})()";
        webView.evaluateJavascript(js, result -> {
            if (!"true".equals(result)) {
                return;
            }
            getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .remove(PENDING_APPLE_KEY)
                .remove(PENDING_APPLE_NONCE_KEY)
                .apply();
        });
    }
}
