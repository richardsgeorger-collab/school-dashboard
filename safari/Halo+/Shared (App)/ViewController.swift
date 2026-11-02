//
//  ViewController.swift
//  Shared (App)
//
//  The Halo+ app's one screen (Loop 308): how to turn Halo+ on in Safari, and whether it is on. The screen itself is
//  Resources/Base.lproj/Main.html; its buttons ask for Safari's settings for Halo+, Halo, or haloplus.app.
//

import WebKit
import SafariServices

#if os(iOS)
import UIKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
typealias PlatformViewController = NSViewController
#endif

let extensionBundleIdentifier = "app.haloplus.HaloPlus.Extension"
let haloURL = URL(string: "https://halo.gcu.edu/")!
let accountURL = URL(string: "https://haloplus.app/#/welcome?src=store")!

class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        self.webView.navigationDelegate = self
#if os(iOS)
        self.webView.scrollView.isScrollEnabled = true
        self.webView.isOpaque = false
        self.webView.backgroundColor = .clear
#endif
        self.webView.configuration.userContentController.add(self, name: "controller")
        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
#if os(iOS)
        // Back from Settings: whether it is on now.
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.refresh()
        }
#endif
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refresh()
    }

    /// Tells the screen the platform and, where Safari says, whether Halo+ is on.
    func refresh() {
#if os(iOS)
        webView.evaluateJavaScript("show('ios')")
        if #available(iOS 26.2, *) {
            SFSafariExtensionManager.getStateOfExtension(withIdentifier: extensionBundleIdentifier) { state, _ in
                guard let state = state else { return }
                DispatchQueue.main.async { self.webView.evaluateJavaScript("show('ios', \(state.isEnabled))") }
            }
        }
#elseif os(macOS)
        webView.evaluateJavaScript("show('mac')")
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { state, _ in
            guard let state = state else { return }
            DispatchQueue.main.async { self.webView.evaluateJavaScript("show('mac', \(state.isEnabled))") }
        }
#endif
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let what = message.body as? String else { return }
        switch what {
        case "open-settings": openSettings()
        case "open-halo": openInSafari(haloURL)
        case "open-account": openInSafari(accountURL)
        default: break
        }
    }

    func openSettings() {
#if os(iOS)
        if #available(iOS 26.2, *) {
            SFSafariSettings.openExtensionsSettings(forIdentifiers: [extensionBundleIdentifier]) { error in
                if error != nil { self.openAppSettings() }
            }
        } else {
            openAppSettings()
        }
#elseif os(macOS)
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { _ in }
#endif
    }

#if os(iOS)
    /// Before iOS 26.2 there is no way to open Safari's extension settings directly: Settings opens, and the screen's
    /// steps say where to go.
    func openAppSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
    }
#endif

    /// Halo and haloplus.app open in Safari (where Halo+ runs), never in another browser set as the default.
    func openInSafari(_ url: URL) {
#if os(iOS)
        // iOS 17+: x-safari-https opens Safari whatever the default browser is.
        let safari = URL(string: "x-safari-" + url.absoluteString)!
        UIApplication.shared.open(safari, options: [:]) { ok in
            if !ok { UIApplication.shared.open(url) }
        }
#elseif os(macOS)
        let safari = URL(fileURLWithPath: "/Applications/Safari.app")
        NSWorkspace.shared.open([url], withApplicationAt: safari, configuration: NSWorkspace.OpenConfiguration()) { _, _ in }
#endif
    }
}
