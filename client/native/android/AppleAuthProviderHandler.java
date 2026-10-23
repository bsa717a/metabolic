package io.capawesome.capacitorjs.plugins.firebase.authentication.handlers;

// Patched copy of @capacitor-firebase/authentication's Apple handler.
// Applied by scripts/apply-native-auth-patches.sh before cap sync.
// Android has no Apple AuthenticationServices sheet. Firebase OAuthProvider opens the
// Apple page and signs the native Firebase user in. skipNativeAuth is the app
// contract: keep the raw nonce, return the Apple ID token to the JS SDK, and
// sign the native user back out so the WebView session matches iOS.

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.android.gms.tasks.Task;
import com.google.firebase.auth.AuthCredential;
import com.google.firebase.auth.AuthResult;
import com.google.firebase.auth.OAuthCredential;
import com.google.firebase.auth.OAuthProvider;
import io.capawesome.capacitorjs.plugins.firebase.authentication.FirebaseAuthentication;
import io.capawesome.capacitorjs.plugins.firebase.authentication.FirebaseAuthenticationHelper;
import io.capawesome.capacitorjs.plugins.firebase.authentication.FirebaseAuthenticationHelper.ProviderId;
import io.capawesome.capacitorjs.plugins.firebase.authentication.FirebaseAuthenticationPlugin;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

public class AppleAuthProviderHandler {

    static final String PREFS = "metabolic.nativeAuth";
    static final String PENDING_NONCE_KEY = "metabolic.pendingAppleNonce";

    private final FirebaseAuthentication pluginImplementation;
    private String currentNonce;

    public AppleAuthProviderHandler(FirebaseAuthentication pluginImplementation) {
        this.pluginImplementation = pluginImplementation;
    }

    public void signIn(PluginCall call) {
        OAuthProvider.Builder provider = OAuthProvider.newBuilder(ProviderId.APPLE);
        applySignInOptions(call, provider);
        Task<AuthResult> pendingResultTask = pluginImplementation.getFirebaseAuthInstance().getPendingAuthResult();
        if (pendingResultTask == null) {
            rememberNonce(generateNonce(32));
            try {
                provider.addCustomParameter("nonce", sha256(currentNonce));
            } catch (NoSuchAlgorithmException e) {
                e.printStackTrace();
            }
            startActivityForSignIn(call, provider);
        } else {
            finishActivityForSignIn(call, pendingResultTask);
        }
    }

    public void link(PluginCall call) {
        OAuthProvider.Builder provider = OAuthProvider.newBuilder(ProviderId.APPLE);
        applySignInOptions(call, provider);
        Task<AuthResult> pendingResultTask = pluginImplementation.getFirebaseAuthInstance().getPendingAuthResult();
        if (pendingResultTask == null) {
            rememberNonce(generateNonce(32));
            try {
                provider.addCustomParameter("nonce", sha256(currentNonce));
            } catch (NoSuchAlgorithmException e) {
                e.printStackTrace();
            }
            startActivityForLink(call, provider);
        } else {
            finishActivityForLink(call, pendingResultTask);
        }
    }

    private SharedPreferences prefs() {
        return pluginImplementation.getPlugin().getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void rememberNonce(String nonce) {
        currentNonce = nonce;
        prefs().edit().putString(PENDING_NONCE_KEY, nonce).apply();
    }

    private String readNonce() {
        if (currentNonce != null && !currentNonce.isEmpty()) {
            return currentNonce;
        }
        String saved = prefs().getString(PENDING_NONCE_KEY, null);
        currentNonce = saved;
        return saved;
    }

    static void clearSavedNonce(SharedPreferences prefs) {
        prefs.edit().remove(PENDING_NONCE_KEY).apply();
    }

    private void clearNonce() {
        currentNonce = null;
        clearSavedNonce(prefs());
    }

    private boolean skipNativeAuth(PluginCall call) {
        return call.getBoolean("skipNativeAuth", pluginImplementation.getConfig().getSkipNativeAuth());
    }

    private void finishSignIn(PluginCall call, AuthResult authResult) {
        String nonce = readNonce();
        String idToken = idTokenFrom(authResult);
        AuthCredential credential = authResult.getCredential();
        clearNonce();
        if (skipNativeAuth(call)) {
            pluginImplementation.getFirebaseAuthInstance().signOut();
            pluginImplementation.handleSuccessfulSignIn(
                call,
                credential,
                idToken,
                nonce,
                null,
                null,
                authResult.getAdditionalUserInfo()
            );
            return;
        }
        pluginImplementation.handleSuccessfulSignIn(call, authResult, idToken, nonce, null);
    }

    private static String idTokenFrom(AuthResult authResult) {
        AuthCredential credential = authResult.getCredential();
        if (credential instanceof OAuthCredential) {
            return ((OAuthCredential) credential).getIdToken();
        }
        return null;
    }

    private void startActivityForSignIn(final PluginCall call, OAuthProvider.Builder provider) {
        pluginImplementation
            .getFirebaseAuthInstance()
            .startActivityForSignInWithProvider(pluginImplementation.getPlugin().getActivity(), provider.build())
            .addOnSuccessListener(authResult -> finishSignIn(call, authResult))
            .addOnFailureListener(exception -> pluginImplementation.handleFailedSignIn(call, null, exception));
    }

    private void finishActivityForSignIn(final PluginCall call, Task<AuthResult> pendingResultTask) {
        pendingResultTask
            .addOnSuccessListener(authResult -> finishSignIn(call, authResult))
            .addOnFailureListener(exception -> pluginImplementation.handleFailedSignIn(call, null, exception));
    }

    private void startActivityForLink(final PluginCall call, OAuthProvider.Builder provider) {
        pluginImplementation
            .getCurrentUser()
            .startActivityForLinkWithProvider(pluginImplementation.getPlugin().getActivity(), provider.build())
            .addOnSuccessListener(authResult -> finishLink(call, authResult))
            .addOnFailureListener(exception -> pluginImplementation.handleFailedLink(call, null, exception));
    }

    private void finishActivityForLink(final PluginCall call, Task<AuthResult> pendingResultTask) {
        pendingResultTask
            .addOnSuccessListener(authResult -> finishLink(call, authResult))
            .addOnFailureListener(exception -> pluginImplementation.handleFailedLink(call, null, exception));
    }

    private void finishLink(PluginCall call, AuthResult authResult) {
        String nonce = readNonce();
        String idToken = idTokenFrom(authResult);
        clearNonce();
        pluginImplementation.handleSuccessfulLink(call, authResult, idToken, nonce, null, null);
    }

    private void applySignInOptions(PluginCall call, OAuthProvider.Builder provider) {
        JSArray customParameters = call.getArray("customParameters");
        if (customParameters != null) {
            try {
                List<Object> customParametersList = customParameters.toList();
                for (int i = 0; i < customParametersList.size(); i++) {
                    JSObject customParameter = JSObject.fromJSONObject((JSONObject) customParametersList.get(i));
                    String key = customParameter.getString("key");
                    String value = customParameter.getString("value");
                    if (key == null || value == null) {
                        continue;
                    }
                    provider.addCustomParameter(key, value);
                }
            } catch (JSONException exception) {
                Log.e(FirebaseAuthenticationPlugin.TAG, "applySignInOptions failed.", exception);
            }
        }

        JSArray scopes = call.getArray("scopes");
        if (scopes != null) {
            try {
                List<String> scopeList = scopes.toList();
                if (!scopeList.isEmpty()) {
                    provider.setScopes(scopeList);
                    return;
                }
            } catch (JSONException exception) {
                Log.e(FirebaseAuthenticationPlugin.TAG, "applySignInOptions failed.", exception);
            }
        }
        // Same name and email scopes the iOS sheet requests.
        provider.setScopes(Arrays.asList("email", "name"));
    }

    // From https://firebase.google.com/docs/auth/android/apple#advanced_handle_the_sign-in_flow_manually
    private String generateNonce(int length) {
        SecureRandom generator = new SecureRandom();

        CharsetDecoder charsetDecoder = StandardCharsets.US_ASCII.newDecoder();
        charsetDecoder.onUnmappableCharacter(CodingErrorAction.IGNORE);
        charsetDecoder.onMalformedInput(CodingErrorAction.IGNORE);

        byte[] bytes = new byte[length];
        ByteBuffer inBuffer = ByteBuffer.wrap(bytes);
        CharBuffer outBuffer = CharBuffer.allocate(length);
        while (outBuffer.hasRemaining()) {
            generator.nextBytes(bytes);
            inBuffer.rewind();
            charsetDecoder.reset();
            charsetDecoder.decode(inBuffer, outBuffer, false);
        }
        outBuffer.flip();
        return outBuffer.toString();
    }

    private String sha256(String s) throws NoSuchAlgorithmException {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] digest = md.digest(s.getBytes());
        StringBuilder hash = new StringBuilder();
        for (byte c : digest) {
            hash.append(String.format("%02x", c));
        }
        return hash.toString();
    }
}
