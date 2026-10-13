import Foundation
import Capacitor
import FirebaseCore
import FirebaseAuth
import AuthenticationServices
import CryptoKit
import UIKit

// Patched copy of @capacitor-firebase/authentication's Apple handler.
// Upstream keeps ASAuthorizationController as a local, so ARC can deallocate
// it before the system sheet appears (ASAuthorizationError 1000). It also
// force-unwraps webView.window, which is nil in a scene-based Capacitor app.
// Applied by scripts/apply-native-auth-patches.sh before cap sync.
class AppleAuthProviderHandler: NSObject {
    var pluginImplementation: FirebaseAuthentication
    fileprivate var currentNonce: String?
    fileprivate var isLink: Bool?
    fileprivate var authorizationController: ASAuthorizationController?

    init(_ pluginImplementation: FirebaseAuthentication) {
        self.pluginImplementation = pluginImplementation
    }

    func signIn(call: CAPPluginCall) {
        if #available(iOS 13, *) {
            self.isLink = false
            self.startSignInWithAppleFlow()
        } else {
            call.reject(self.pluginImplementation.getPlugin().errorDeviceUnsupported)
        }
    }

    func link(call: CAPPluginCall) {
        if #available(iOS 13, *) {
            self.isLink = true
            self.startSignInWithAppleFlow()
        } else {
            call.reject(self.pluginImplementation.getPlugin().errorDeviceUnsupported)
        }
    }
}

@available(iOS 13.0, *)
extension AppleAuthProviderHandler: ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = pluginImplementation.getPlugin().bridge?.webView?.window {
            return window
        }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let active = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        if let window = active?.windows.first(where: \.isKeyWindow) ?? active?.windows.first {
            return window
        }
        return ASPresentationAnchor()
    }

    private func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        let charset: [Character] =
            Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remainingLength = length

        while remainingLength > 0 {
            let randoms: [UInt8] = (0 ..< 16).map { _ in
                var random: UInt8 = 0
                let errorCode = SecRandomCopyBytes(kSecRandomDefault, 1, &random)
                if errorCode != errSecSuccess {
                    fatalError("Unable to generate nonce. SecRandomCopyBytes failed with OSStatus \(errorCode)")
                }
                return random
            }

            randoms.forEach { random in
                if remainingLength == 0 {
                    return
                }

                if random < charset.count {
                    result.append(charset[Int(random)])
                    remainingLength -= 1
                }
            }
        }

        return result
    }

    func startSignInWithAppleFlow() {
        let nonce = randomNonceString()
        currentNonce = nonce
        let appleIDProvider = ASAuthorizationAppleIDProvider()
        let request = appleIDProvider.createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = sha256(nonce)

        DispatchQueue.main.async {
            let authorizationController = ASAuthorizationController(authorizationRequests: [request])
            authorizationController.delegate = self
            authorizationController.presentationContextProvider = self
            self.authorizationController = authorizationController
            authorizationController.performRequests()
        }
    }

    private func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashedData = SHA256.hash(data: inputData)
        let hashString = hashedData.compactMap {
            return String(format: "%02x", $0)
        }.joined()

        return hashString
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        authorizationController = nil
        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            rejectAppleAuth("Apple sign-in returned an unexpected credential.")
            return
        }
        guard let nonce = currentNonce else {
            rejectAppleAuth("Apple sign-in nonce was missing.")
            return
        }
        guard let appleIDToken = appleIDCredential.identityToken else {
            rejectAppleAuth("Apple sign-in did not return an identity token.")
            return
        }
        var authorizationCode: String?
        if let authorizationCodeData = appleIDCredential.authorizationCode {
            authorizationCode = String(data: authorizationCodeData, encoding: .utf8)
        }
        guard let idTokenString = String(data: appleIDToken, encoding: .utf8) else {
            rejectAppleAuth("Apple sign-in identity token could not be decoded.")
            return
        }
        var displayName: String?
        if let fullName = appleIDCredential.fullName {
            if let givenName = fullName.givenName, let familyName = fullName.familyName {
                displayName = "\(givenName) \(familyName)"
            }
        }
        let credential = OAuthProvider.appleCredential(withIDToken: idTokenString,
                                                       rawNonce: nonce,
                                                       fullName: appleIDCredential.fullName)
        guard let isLink = self.isLink else {
            rejectAppleAuth("Apple sign-in was not started.")
            return
        }
        if isLink == true {
            self.pluginImplementation.handleSuccessfulLink(credential: credential, idToken: idTokenString, nonce: nonce,
                                                           accessToken: nil, serverAuthCode: nil, displayName: displayName, authorizationCode: authorizationCode)
        } else {
            self.pluginImplementation.handleSuccessfulSignIn(credential: credential, idToken: idTokenString, nonce: nonce,
                                                             accessToken: nil, displayName: displayName, authorizationCode: authorizationCode, serverAuthCode: nil)
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        authorizationController = nil
        rejectAppleAuth(nil, error: error)
    }

    private func rejectAppleAuth(_ message: String?, error: Error? = nil) {
        if isLink == true {
            pluginImplementation.handleFailedLink(message: message, error: error)
        } else {
            pluginImplementation.handleFailedSignIn(message: message, error: error)
        }
    }
}
