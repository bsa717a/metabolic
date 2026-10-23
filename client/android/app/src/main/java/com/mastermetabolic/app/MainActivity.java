package com.mastermetabolic.app;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * Injects Google tokens saved by the patched Android auth handler.
 * Same localStorage key and event as the iOS SceneDelegate handoff.
 */
public class MainActivity extends BridgeActivity {
    static final String PREFS = "metabolic.nativeAuth";
    static final String PENDING_GOOGLE_KEY = "metabolic.pendingGoogleAuth";
    static final String PENDING_APPLE_KEY = "metabolic.pendingAppleAuth";
    static final String PENDING_APPLE_NONCE_KEY = "metabolic.pendingAppleNonce";
    private static final String PENDING_AUTH_BRIDGE = "MetabolicNativeAuth";

    private final PendingAuthBridge pendingAuthBridge = new PendingAuthBridge();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // OAuth often resumes before the WebView is on the app origin. Page
        // load retries both handoffs without waiting for another resume.
        bridgeBuilder.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    injectPendingGoogleAuth();
                    injectPendingAppleAuth();
                }
            }
        );
        super.onCreate(savedInstanceState);
        attachPendingAuthBridge();
    }

    @Override
    public void onResume() {
        super.onResume();
        attachPendingAuthBridge();
        injectPendingGoogleAuth();
        injectPendingAppleAuth();
    }

    private void attachPendingAuthBridge() {
        Bridge bridge = getBridge();
        if (bridge == null) {
            return;
        }
        WebView webView = bridge.getWebView();
        if (webView == null) {
            return;
        }
        webView.removeJavascriptInterface(PENDING_AUTH_BRIDGE);
        webView.addJavascriptInterface(pendingAuthBridge, PENDING_AUTH_BRIDGE);
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
        // error == nil. A false or null result leaves the preference so onResume
        // or the next page load can try again. Do not drop a token that was not stored.
        // If logout already replaced this payload, skip it instead of writing it back.
        String js = handoffScript(PENDING_GOOGLE_KEY, "metabolic-pending-google-auth", "pendingGoogle", escaped);
        webView.evaluateJavascript(js, result -> clearPreferenceIfUnchanged(PENDING_GOOGLE_KEY, json, result));
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
        // Same gate as Google: clear the preference only after localStorage is set
        // on the app origin. A false or null result keeps the Apple JSON.
        String js = handoffScript(PENDING_APPLE_KEY, "metabolic-pending-apple-auth", "pendingApple", escaped);
        webView.evaluateJavascript(
            js,
            result -> clearPreferenceIfUnchanged(PENDING_APPLE_KEY, json, result, PENDING_APPLE_NONCE_KEY)
        );
    }

    private static String handoffScript(String storageKey, String eventName, String bridgeMethod, String escaped) {
        return "(function () {" +
        " try {" +
        " if (window.location.origin !== 'https://metaos.mastermetabolic.com') return false;" +
        " var expected = '" +
        escaped +
        "';" +
        " var bridge = window.MetabolicNativeAuth;" +
        " if (bridge && bridge." +
        bridgeMethod +
        "() !== expected) return false;" +
        " window.localStorage.setItem('" +
        storageKey +
        "', expected);" +
        " if (bridge && bridge." +
        bridgeMethod +
        "() !== expected) {" +
        " window.localStorage.removeItem('" +
        storageKey +
        "');" +
        " return false;" +
        " }" +
        " window.dispatchEvent(new Event('" +
        eventName +
        "'));" +
        " return true;" +
        " } catch (e) { return false; }" +
        "})()";
    }

    private void clearPreferenceIfUnchanged(String key, String json, String result, String... extraKeys) {
        if (!"true".equals(result)) {
            return;
        }
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        if (!json.equals(prefs.getString(key, null))) {
            return;
        }
        SharedPreferences.Editor editor = prefs.edit().remove(key);
        for (String extraKey : extraKeys) {
            editor.remove(extraKey);
        }
        editor.apply();
    }

    /**
     * Logout calls clearPending after Firebase signs the current user out.
     * Injection reads the same preferences and skips a payload that logout,
     * or a newer sign-in, already replaced.
     */
    private final class PendingAuthBridge {
        @JavascriptInterface
        public String pendingGoogle() {
            return pendingValue(PENDING_GOOGLE_KEY);
        }

        @JavascriptInterface
        public String pendingApple() {
            return pendingValue(PENDING_APPLE_KEY);
        }

        @JavascriptInterface
        public void clearPending() {
            getSharedPreferences(PREFS, MODE_PRIVATE)
                .edit()
                .remove(PENDING_GOOGLE_KEY)
                .remove(PENDING_APPLE_KEY)
                .remove(PENDING_APPLE_NONCE_KEY)
                .apply();
        }

        private String pendingValue(String key) {
            String value = getSharedPreferences(PREFS, MODE_PRIVATE).getString(key, null);
            return value == null ? "" : value;
        }
    }
}
