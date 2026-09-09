import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        injectPendingGoogleAuth()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        injectPendingGoogleAuth()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    private func injectPendingGoogleAuth() {
        guard let dict = UserDefaults.standard.dictionary(forKey: "metabolic.pendingGoogleAuth"),
              JSONSerialization.isValidJSONObject(dict),
              let data = try? JSONSerialization.data(withJSONObject: dict),
              let json = String(data: data, encoding: .utf8)
        else {
            return
        }
        guard let bridgeViewController = window?.rootViewController as? CAPBridgeViewController,
              let webView = bridgeViewController.webView
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
        webView.evaluateJavaScript(js) { _, error in
            if error == nil {
                UserDefaults.standard.removeObject(forKey: "metabolic.pendingGoogleAuth")
            }
        }
    }
}
