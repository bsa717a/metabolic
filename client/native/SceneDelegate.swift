import AVFoundation
import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    /// Classic `--app-bg`. Used so the native window / WKWebView never flash black
    /// in the Dynamic Island / home-indicator gutters before CSS paints.
    private let chromeBackground = UIColor(red: 233.0 / 255.0, green: 236.0 / 255.0, blue: 239.0 / 255.0, alpha: 1)

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.backgroundColor = chromeBackground
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        observeAudioSession()
        configurePlaybackAudioSession()
        disableWebViewOverscroll()
        injectPendingGoogleAuth()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        configurePlaybackAudioSession()
        disableWebViewOverscroll()
        injectPendingGoogleAuth()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    /// Workout 5 / 3-2-1 beeps and the recorded "Go!" clip play inside WKWebView
    /// (HTMLAudio ticks + recorded Go). The default ambient session is muted by
    /// the Silent switch. `.playback` + `.mixWithOthers` plays through Silent
    /// without pausing Spotify / Apple Music. Prefer mix over duck so Music
    /// keeps going; duck only if a later TestFlight pass finds cues inaudible.
    /// Re-applied on become-active and after interruptions in case WKWebView
    /// or another app changed the session.
    private func configurePlaybackAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            print("[sessionCues] AVAudioSession configure failed: \(error)")
        }
    }

    private func observeAudioSession() {
        let center = NotificationCenter.default
        center.addObserver(
            self,
            selector: #selector(handleAudioInterruption(_:)),
            name: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance()
        )
        center.addObserver(
            self,
            selector: #selector(handleMediaServicesReset),
            name: AVAudioSession.mediaServicesWereResetNotification,
            object: AVAudioSession.sharedInstance()
        )
    }

    @objc private func handleAudioInterruption(_ notification: Notification) {
        guard
            let typeValue = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: typeValue),
            type == .ended
        else { return }
        configurePlaybackAudioSession()
    }

    @objc private func handleMediaServicesReset() {
        configurePlaybackAudioSession()
    }

    /// Capacitor already sets `scrollView.bounces = false`, but iOS can still
    /// rubber-band the whole WKWebView when `contentInset` is automatic or when
    /// `alwaysBounceVertical` stays on. Pin both off so the tab bar cannot lift
    /// off the home indicator during over-scroll.
    private func disableWebViewOverscroll() {
        guard let bridgeViewController = window?.rootViewController as? CAPBridgeViewController,
              let webView = bridgeViewController.webView
        else {
            return
        }
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.backgroundColor = chromeBackground
        webView.scrollView.backgroundColor = chromeBackground
        webView.isOpaque = false
        bridgeViewController.view.backgroundColor = chromeBackground
        window?.backgroundColor = chromeBackground
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
