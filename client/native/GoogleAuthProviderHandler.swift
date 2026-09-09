import Foundation
import Capacitor
import FirebaseCore
import FirebaseAuth
import WebKit
#if RGCFA_INCLUDE_GOOGLE
import GoogleSignIn
#endif

// Patched copy of @capacitor-firebase/authentication's Google handler.
// Applied by scripts/apply-native-auth-patches.sh before cap sync.
class GoogleAuthProviderHandler: NSObject {
    let errorSdkNotIncluded = "The Google Sign-In SDK is not included in this build. Add the required CocoaPods subspec or Swift package trait."
    var pluginImplementation: FirebaseAuthentication
    private let firebaseWebClientID = "707557008901-utr23g550vsjatn2g2fv112uq9daf7pr.apps.googleusercontent.com"
    private let pendingGoogleAuthKey = "metabolic.pendingGoogleAuth"

    init(_ pluginImplementation: FirebaseAuthentication) {
        self.pluginImplementation = pluginImplementation
        super.init()
    }

    func signIn(call: CAPPluginCall) {
        startSignInWithGoogleFlow(call, isLink: false)
    }

    func link(call: CAPPluginCall) {
        startSignInWithGoogleFlow(call, isLink: true)
    }

    func signOut() {
        #if RGCFA_INCLUDE_GOOGLE
        GIDSignIn.sharedInstance.signOut()
        #endif
    }

    private func googleServerClientID() -> String {
        if let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
           let dict = NSDictionary(contentsOfFile: path),
           let serverClientId = dict["SERVER_CLIENT_ID"] as? String
        {
            let trimmed = serverClientId.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                return trimmed
            }
        }
        return firebaseWebClientID
    }

    private func persistPendingGoogleAuth(idToken: String, accessToken: String, webView: WKWebView?) {
        UserDefaults.standard.set(
            ["idToken": idToken, "accessToken": accessToken],
            forKey: pendingGoogleAuthKey
        )
        guard let dict = UserDefaults.standard.dictionary(forKey: pendingGoogleAuthKey),
              JSONSerialization.isValidJSONObject(dict),
              let data = try? JSONSerialization.data(withJSONObject: dict),
              let json = String(data: data, encoding: .utf8),
              let webView
        else {
            return
        }
        let escaped = json
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "'", with: "\\'")
            .replacingOccurrences(of: "\n", with: "")
        let js = """
        try {
          window.localStorage.setItem('metabolic.pendingGoogleAuth', '\(escaped)');
          window.dispatchEvent(new Event('metabolic-pending-google-auth'));
        } catch (e) {}
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    private func startSignInWithGoogleFlow(_ call: CAPPluginCall, isLink: Bool) {
        #if RGCFA_INCLUDE_GOOGLE
        guard let clientId = FirebaseApp.app()?.options.clientID else {
            pluginImplementation.handleFailedSignIn(message: "Firebase is not configured for Google sign-in.", error: nil)
            return
        }
        let config = GIDConfiguration(clientID: clientId, serverClientID: googleServerClientID())
        GIDSignIn.sharedInstance.configuration = config
        guard let controller = pluginImplementation.getPlugin().bridge?.viewController else {
            pluginImplementation.handleFailedSignIn(message: "Google sign-in could not find a view to present from.", error: nil)
            return
        }
        let scopes = call.getArray("scopes", String.self) ?? []
        let implementation = pluginImplementation
        let webView = pluginImplementation.getPlugin().bridge?.webView

        DispatchQueue.main.async {
            GIDSignIn.sharedInstance.signIn(withPresenting: controller, hint: nil, additionalScopes: scopes) { result, error in
                if let error = error {
                    if isLink == true {
                        implementation.handleFailedLink(message: nil, error: error)
                    } else {
                        implementation.handleFailedSignIn(message: nil, error: error)
                    }
                    return
                }

                guard let user = result?.user,
                      let idToken = user.idToken?.tokenString
                else {
                    implementation.handleFailedSignIn(message: "Google sign-in did not return an ID token.", error: nil)
                    return
                }
                let accessToken = user.accessToken.tokenString
                self.persistPendingGoogleAuth(idToken: idToken, accessToken: accessToken, webView: webView)
                let serverAuthCode = result?.serverAuthCode
                let credential = GoogleAuthProvider.credential(withIDToken: idToken, accessToken: accessToken)
                if isLink == true {
                    implementation.handleSuccessfulLink(credential: credential, idToken: idToken, nonce: nil,
                                                        accessToken: accessToken, serverAuthCode: serverAuthCode, displayName: nil, authorizationCode: nil)
                } else {
                    implementation.handleSuccessfulSignIn(credential: credential, idToken: idToken, nonce: nil,
                                                          accessToken: accessToken, displayName: nil, authorizationCode: nil, serverAuthCode: serverAuthCode)
                }
            }
        }
        #else
        if isLink == true {
            pluginImplementation.handleFailedLink(message: errorSdkNotIncluded, error: nil)
        } else {
            pluginImplementation.handleFailedSignIn(message: errorSdkNotIncluded, error: nil)
        }
        #endif
    }
}
