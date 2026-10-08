import Capacitor
import UIKit
import WebKit

// Saving signed in (1.8.0), the same calls as Android's SignInPlugin.java:
//
//   open({ url })        resolves { url } once the browser is closed
//   cookies({ url })     { cookie }: the Cookie header for that address
//   signOut({ host })    forgets the cookies and storage of the site
//
// The site opens in a WKWebView on the default data store, so its sign-in
// cookies stay there; cookies() also copies them into the shared cookie
// storage CapacitorHttp's URLSession reads, so Waypage's requests to the
// site carry them. No Capacitor bridge or message handlers in the browser,
// http(s) only.
@objc(SignInPlugin)
public class SignInPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SignInPlugin"
    public let jsName = "SignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cookies", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signOut", returnType: CAPPluginReturnPromise)
    ]

    @objc func open(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https" || url.scheme == "http" else {
            call.reject("Not a web address")
            return
        }
        DispatchQueue.main.async {
            guard let host = self.bridge?.viewController else {
                call.reject("No window")
                return
            }
            let page = SignInPage(url: url) { last in call.resolve(["url": last]) }
            let nav = UINavigationController(rootViewController: page)
            nav.presentationController?.delegate = page
            host.present(nav, animated: true)
        }
    }

    @objc func cookies(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), let host = url.host?.lowercased() else {
            call.resolve(["cookie": ""])
            return
        }
        DispatchQueue.main.async {
            WKWebsiteDataStore.default().httpCookieStore.getAllCookies { all in
                let now = Date()
                let path = url.path.isEmpty ? "/" : url.path
                let match = all.filter { c in
                    let d = c.domain.lowercased()
                    let bare = d.hasPrefix(".") ? String(d.dropFirst()) : d
                    return (host == bare || host.hasSuffix("." + bare))
                        && path.hasPrefix(c.path)
                        && (!c.isSecure || url.scheme == "https")
                        && (c.expiresDate.map { $0 > now } ?? true)
                }
                match.forEach { HTTPCookieStorage.shared.setCookie($0) }
                call.resolve(["cookie": match.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")])
            }
        }
    }

    @objc func signOut(_ call: CAPPluginCall) {
        guard let host = call.getString("host")?.lowercased(), host.contains(".") else {
            call.reject("Not a site")
            return
        }
        let ofSite = { (domain: String) -> Bool in
            let d = domain.lowercased()
            let bare = d.hasPrefix(".") ? String(d.dropFirst()) : d
            return bare == host || bare.hasSuffix("." + host)
        }
        (HTTPCookieStorage.shared.cookies ?? []).filter { ofSite($0.domain) }.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
        DispatchQueue.main.async {
            let store = WKWebsiteDataStore.default()
            store.httpCookieStore.getAllCookies { all in
                let gone = all.filter { ofSite($0.domain) }
                let group = DispatchGroup()
                for c in gone {
                    group.enter()
                    store.httpCookieStore.delete(c) { group.leave() }
                }
                group.notify(queue: .main) {
                    // The site's own storage too, never the app's (localhost).
                    let types = WKWebsiteDataStore.allWebsiteDataTypes()
                    store.fetchDataRecords(ofTypes: types) { records in
                        let mine = records.filter { ofSite($0.displayName) }
                        store.removeData(ofTypes: types, for: mine) { call.resolve() }
                    }
                }
            }
        }
    }
}

private final class SignInPage: UIViewController, WKNavigationDelegate, WKUIDelegate, UIAdaptivePresentationControllerDelegate {
    let start: URL
    let closed: (String) -> Void
    var web: WKWebView!
    var finished = false

    init(url: URL, closed: @escaping (String) -> Void) {
        self.start = url
        self.closed = closed
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("not used") }

    override func viewDidLoad() {
        super.viewDidLoad()
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        web = WKWebView(frame: view.bounds, configuration: config)
        web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        view.backgroundColor = .systemBackground
        view.addSubview(web)
        title = SignInPage.hostOf(start)
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(done))
        web.load(URLRequest(url: start))
    }

    static func hostOf(_ url: URL?) -> String {
        let h = url?.host ?? ""
        return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
    }

    @objc func done() {
        dismiss(animated: true) { self.finish() }
    }

    func finish() {
        if finished { return }
        finished = true
        closed(web?.url?.absoluteString ?? start.absoluteString)
    }

    // Swiped down instead of Done.
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        finish()
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let scheme = action.request.url?.scheme ?? ""
        decisionHandler(scheme == "https" || scheme == "http" || scheme == "about" ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        title = SignInPage.hostOf(webView.url)
    }

    // A sign-in that opens a window of its own loads here instead.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if action.targetFrame == nil { webView.load(action.request) }
        return nil
    }
}
