import AVFoundation
import UIKit
import Capacitor
import WebKit
import ObjectiveC

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    /// Classic `--app-bg`. Used so the native window / WKWebView never flash black
    /// in the Dynamic Island / home-indicator gutters before CSS paints.
    private let chromeBackground = UIColor(red: 233.0 / 255.0, green: 236.0 / 255.0, blue: 239.0 / 255.0, alpha: 1)

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // Install mix-with-others before WKWebView / Capacitor can take an exclusive
        // app-process session. Workout cues themselves play natively (see
        // SessionCuesPlugin) because WKWebView media runs in another process and
        // ignores this session — that is why HTMLAudio ticks still paused Music.
        MixableAudioSession.install()
        MixableAudioSession.configure()

        window = UIWindow(windowScene: windowScene)
        window?.backgroundColor = chromeBackground
        window?.rootViewController = MetabolicBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        observeAudioSession()
        disableWebViewOverscroll()
        injectPendingGoogleAuth()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        MixableAudioSession.configure()
        disableWebViewOverscroll()
        injectPendingGoogleAuth()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
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
        MixableAudioSession.configure()
    }

    @objc private func handleMediaServicesReset() {
        MixableAudioSession.configure()
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

/// Local Capacitor plugin host. Custom App-target plugins must be registered
/// in `capacitorDidLoad()` — auto-discovery does not pick them up.
class MetabolicBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SessionCuesPlugin())
    }
}

/// App-process session for native workout cues.
///
/// `.playback` + `.mixWithOthers` (no duck) plays through the Silent switch
/// without pausing Apple Music / Spotify. WKWebView HTMLAudio / Web Audio
/// cannot use this session — WebKit media runs in another process and takes
/// exclusive playback, which is why #294 still paused Music. Cues therefore
/// play via `SessionCuesPlugin` + `AVAudioPlayer` here.
///
/// Never deactivate the session: that notifies other apps to stop or resume
/// and can pause Music. Re-apply category only when mix is missing so we do
/// not bounce mode mid-cue.
enum MixableAudioSession {
    private static var installed = false

    static func install() {
        guard !installed else { return }
        installed = true
        swizzle(
            original: #selector(AVAudioSession.setCategory(_:mode:options:)),
            swizzled: #selector(AVAudioSession.metabolic_setCategory(_:mode:options:))
        )
        swizzle(
            original: #selector(AVAudioSession.setCategory(_:mode:policy:options:)),
            swizzled: #selector(AVAudioSession.metabolic_setCategory(_:mode:policy:options:))
        )
    }

    static func configure() {
        let session = AVAudioSession.sharedInstance()
        let mix: AVAudioSession.CategoryOptions = [.mixWithOthers]
        let alreadyMixing =
            session.category == .playback &&
            session.mode == .default &&
            session.categoryOptions.contains(.mixWithOthers)
        do {
            if !alreadyMixing {
                try session.setCategory(.playback, mode: .default, options: mix)
            }
            try session.setActive(true)
        } catch {
            print("[sessionCues] AVAudioSession configure failed: \(error)")
        }
    }

    private static func swizzle(original: Selector, swizzled: Selector) {
        guard
            let originalMethod = class_getInstanceMethod(AVAudioSession.self, original),
            let swizzledMethod = class_getInstanceMethod(AVAudioSession.self, swizzled)
        else { return }
        method_exchangeImplementations(originalMethod, swizzledMethod)
    }
}

extension AVAudioSession {
    @objc func metabolic_setCategory(
        _ category: AVAudioSession.Category,
        mode: AVAudioSession.Mode,
        options: AVAudioSession.CategoryOptions
    ) throws {
        try metabolic_setCategory(category, mode: mode, options: MixableAudioSession.mixing(options, for: category))
    }

    @objc func metabolic_setCategory(
        _ category: AVAudioSession.Category,
        mode: AVAudioSession.Mode,
        policy: AVAudioSession.RouteSharingPolicy,
        options: AVAudioSession.CategoryOptions
    ) throws {
        try metabolic_setCategory(
            category,
            mode: mode,
            policy: policy,
            options: MixableAudioSession.mixing(options, for: category)
        )
    }
}

extension MixableAudioSession {
    fileprivate static func mixing(
        _ options: AVAudioSession.CategoryOptions,
        for category: AVAudioSession.Category
    ) -> AVAudioSession.CategoryOptions {
        var opts = options
        if category == .playback || category == .playAndRecord || category == .multiRoute {
            opts.insert(.mixWithOthers)
        }
        opts.remove(.duckOthers)
        return opts
    }
}

/// Plays 5 / 3-2-1 ticks and the recorded Go clip in-process so Music is not
/// interrupted by WKWebView's exclusive media session.
final class CueAudioPlayer {
    static let shared = CueAudioPlayer()

    private var tickPlayer: AVAudioPlayer?
    private var goPlayer: AVAudioPlayer?

    private init() {}

    func prime() {
        MixableAudioSession.configure()
        if tickPlayer == nil { tickPlayer = makeTickPlayer() }
        if goPlayer == nil { goPlayer = makeGoPlayer() }
        tickPlayer?.prepareToPlay()
        goPlayer?.prepareToPlay()
    }

    func playTick() throws {
        MixableAudioSession.configure()
        if tickPlayer == nil { tickPlayer = makeTickPlayer() }
        guard let player = tickPlayer else {
            throw CueAudioError.tickUnavailable
        }
        player.currentTime = 0
        player.volume = 1
        if !player.play() { throw CueAudioError.tickUnavailable }
    }

    func playGo() throws {
        MixableAudioSession.configure()
        if goPlayer == nil { goPlayer = makeGoPlayer() }
        guard let player = goPlayer else {
            throw CueAudioError.goUnavailable
        }
        player.currentTime = 0
        player.volume = 1
        if !player.play() { throw CueAudioError.goUnavailable }
    }

    private func makeTickPlayer() -> AVAudioPlayer? {
        player(from: CueTone.tick.wavData())
    }

    private func makeGoPlayer() -> AVAudioPlayer? {
        if let url = CueTone.goClipURL() {
            return player(from: url)
        }
        return player(from: CueTone.go.wavData())
    }

    private func player(from data: Data) -> AVAudioPlayer? {
        do {
            let player = try AVAudioPlayer(data: data)
            player.volume = 1
            player.prepareToPlay()
            return player
        } catch {
            print("[sessionCues] AVAudioPlayer data failed: \(error)")
            return nil
        }
    }

    private func player(from url: URL) -> AVAudioPlayer? {
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.volume = 1
            player.prepareToPlay()
            return player
        } catch {
            print("[sessionCues] AVAudioPlayer url failed: \(error)")
            return nil
        }
    }
}

enum CueAudioError: LocalizedError {
    case tickUnavailable
    case goUnavailable

    var errorDescription: String? {
        switch self {
        case .tickUnavailable: return "native tick unavailable"
        case .goUnavailable: return "native Go clip unavailable"
        }
    }
}

/// Same motif as `sessionCues.ts` (880 Hz tick / 1175 Hz Go fallback).
struct CueTone {
    var freq: Double
    var dur: Double
    var gain: Double

    static let tick = CueTone(freq: 880, dur: 0.15, gain: 1)
    static let go = CueTone(freq: 1175, dur: 0.22, gain: 1)

    private static let partials: [(ratio: Double, mix: Double)] = [
        (1, 0.7), (2, 0.22), (3, 0.08)
    ]

    static func goClipURL() -> URL? {
        let bundle = Bundle.main
        let candidates = [
            bundle.url(forResource: "go", withExtension: "wav", subdirectory: "public/audio"),
            bundle.url(forResource: "audio/go", withExtension: "wav", subdirectory: "public"),
            bundle.bundleURL.appendingPathComponent("public/audio/go.wav")
        ]
        return candidates.first { url in
            guard let url else { return false }
            return FileManager.default.fileExists(atPath: url.path)
        } ?? nil
    }

    func wavData() -> Data {
        let sampleRate = 22050
        let numSamples = Int(Double(sampleRate) * dur)
        var samples = [Int16](repeating: 0, count: numSamples)
        let peak = min(1, gain)
        for i in 0..<numSamples {
            let t = Double(i) / Double(sampleRate)
            var wave = 0.0
            for partial in Self.partials {
                wave += sin(2 * Double.pi * freq * partial.ratio * t) * partial.mix
            }
            let env = min(1, t * 80) * min(1, (dur - t) * 20)
            let clipped = max(-32767.0, min(32767.0, (wave * env * 32767 * peak).rounded()))
            samples[i] = Int16(clipped)
        }

        let dataSize = samples.count * 2
        var data = Data(count: 44 + dataSize)
        data.replaceSubrange(0..<4, with: Array("RIFF".utf8))
        data.replaceSubrange(4..<8, with: withUnsafeBytes(of: UInt32(36 + dataSize).littleEndian) { Data($0) })
        data.replaceSubrange(8..<12, with: Array("WAVE".utf8))
        data.replaceSubrange(12..<16, with: Array("fmt ".utf8))
        data.replaceSubrange(16..<20, with: withUnsafeBytes(of: UInt32(16).littleEndian) { Data($0) })
        data.replaceSubrange(20..<22, with: withUnsafeBytes(of: UInt16(1).littleEndian) { Data($0) })
        data.replaceSubrange(22..<24, with: withUnsafeBytes(of: UInt16(1).littleEndian) { Data($0) })
        data.replaceSubrange(24..<28, with: withUnsafeBytes(of: UInt32(sampleRate).littleEndian) { Data($0) })
        data.replaceSubrange(28..<32, with: withUnsafeBytes(of: UInt32(sampleRate * 2).littleEndian) { Data($0) })
        data.replaceSubrange(32..<34, with: withUnsafeBytes(of: UInt16(2).littleEndian) { Data($0) })
        data.replaceSubrange(34..<36, with: withUnsafeBytes(of: UInt16(16).littleEndian) { Data($0) })
        data.replaceSubrange(36..<40, with: Array("data".utf8))
        data.replaceSubrange(40..<44, with: withUnsafeBytes(of: UInt32(dataSize).littleEndian) { Data($0) })
        samples.withUnsafeBytes { raw in
            data.replaceSubrange(44..<(44 + dataSize), with: raw)
        }
        return data
    }
}

@objc(SessionCuesPlugin)
public class SessionCuesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SessionCuesPlugin"
    public let jsName = "SessionCues"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prime", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playTick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playGo", returnType: CAPPluginReturnPromise)
    ]

    public override func load() {
        MixableAudioSession.install()
        MixableAudioSession.configure()
    }

    @objc func prime(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            CueAudioPlayer.shared.prime()
            call.resolve()
        }
    }

    @objc func playTick(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                try CueAudioPlayer.shared.playTick()
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func playGo(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                try CueAudioPlayer.shared.playGo()
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }
}
