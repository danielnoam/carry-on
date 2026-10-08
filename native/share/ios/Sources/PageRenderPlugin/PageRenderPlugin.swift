import Capacitor
import UIKit
import WebKit

// Pages that build themselves with JavaScript (src/save.js), on iOS too
// (1.6.0): the same call as Android's PageRenderPlugin.java,
//
//   render({ url, timeoutMs })   { html, url } once the page has drawn its text
//
// The page runs in its own WKWebView, out of sight behind the app's: no
// Capacitor bridge, no message handlers, a data store of its own that keeps
// nothing, http(s) only, and no pictures, media or fonts loaded. Only the
// HTML it ends up with comes back, and save.js turns that into the same
// script-free copy as any other page.
@objc(PageRenderPlugin)
public class PageRenderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PageRenderPlugin"
    public let jsName = "PageRender"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "render", returnType: CAPPluginReturnPromise)
    ]

    private var jobs: [Job] = []
    private var rules: WKContentRuleList?

    private static let blockList = """
    [{"trigger":{"url-filter":".*","resource-type":["image","media","font"]},"action":{"type":"block"}}]
    """

    @objc func render(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw), url.scheme == "https" || url.scheme == "http" else {
            call.reject("Not a web address")
            return
        }
        let timeout = max(5, min(60, (call.getDouble("timeoutMs") ?? 20000) / 1000))
        DispatchQueue.main.async {
            if self.rules != nil {
                self.start(call, url, timeout)
                return
            }
            WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "waypage-render", encodedContentRuleList: PageRenderPlugin.blockList) { list, _ in
                DispatchQueue.main.async {
                    self.rules = list
                    self.start(call, url, timeout)
                }
            }
        }
    }

    private func start(_ call: CAPPluginCall, _ url: URL, _ timeout: Double) {
        guard let host = bridge?.viewController?.view else {
            call.reject("No window")
            return
        }
        let job = Job(call: call, url: url, timeout: timeout, rules: rules) { [weak self] done in
            self?.jobs.removeAll { $0 === done }
        }
        jobs.append(job)
        job.start(in: host)
    }

    private final class Job: NSObject, WKNavigationDelegate {
        static let pollSeconds = 0.7
        static let minText = 500

        let call: CAPPluginCall
        let url: URL
        let timeout: Double
        let rules: WKContentRuleList?
        let finished: (Job) -> Void
        var web: WKWebView?
        var done = false
        var loaded = false
        var lastLength = -1
        var steady = 0

        init(call: CAPPluginCall, url: URL, timeout: Double, rules: WKContentRuleList?, finished: @escaping (Job) -> Void) {
            self.call = call
            self.url = url
            self.timeout = timeout
            self.rules = rules
            self.finished = finished
        }

        func start(in host: UIView) {
            let config = WKWebViewConfiguration()
            config.websiteDataStore = .nonPersistent()
            config.mediaTypesRequiringUserActionForPlayback = .all
            config.allowsInlineMediaPlayback = false
            config.preferences.javaScriptCanOpenWindowsAutomatically = false
            if let r = rules { config.userContentController.add(r) }
            let w = WKWebView(frame: host.bounds, configuration: config)
            w.navigationDelegate = self
            w.alpha = 0
            w.isUserInteractionEnabled = false
            w.accessibilityElementsHidden = true
            // Behind the app's own WebView, so it never takes a touch.
            host.insertSubview(w, at: 0)
            web = w
            DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in self?.take() }
            w.load(URLRequest(url: url))
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            let scheme = action.request.url?.scheme ?? ""
            decisionHandler(scheme == "https" || scheme == "http" || scheme == "about" ? .allow : .cancel)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            if loaded { return }
            loaded = true
            DispatchQueue.main.asyncAfter(deadline: .now() + Job.pollSeconds) { [weak self] in self?.poll() }
        }

        // Waits for the text to stop growing: most of these pages draw an
        // empty frame first, then fill it from a request of their own.
        func poll() {
            guard !done, let w = web else { return }
            w.evaluateJavaScript("document.body ? document.body.innerText.length : 0") { [weak self] v, _ in
                guard let self = self, !self.done else { return }
                let n = (v as? NSNumber)?.intValue ?? 0
                self.steady = n == self.lastLength ? self.steady + 1 : 0
                self.lastLength = n
                if n >= Job.minText && self.steady >= 2 { self.take() }
                else { DispatchQueue.main.asyncAfter(deadline: .now() + Job.pollSeconds) { [weak self] in self?.poll() } }
            }
        }

        func take() {
            guard !done, let w = web else { return }
            done = true
            w.evaluateJavaScript("document.documentElement.outerHTML") { [weak self] v, _ in
                guard let self = self else { return }
                let html = v as? String ?? ""
                let at = w.url?.absoluteString ?? self.url.absoluteString
                self.finish()
                if html.isEmpty { self.call.reject("The page didn't draw anything"); return }
                self.call.resolve(["html": html, "url": at.hasPrefix("http") ? at : self.url.absoluteString])
            }
        }

        func finish() {
            web?.stopLoading()
            web?.navigationDelegate = nil
            web?.removeFromSuperview()
            web = nil
            finished(self)
        }
    }
}
