import Capacitor
import UIKit
import WebKit

// A saved page to the print screen, where pinching the preview open makes
// a PDF to save or send (src/app.js, 0.20.0). The same call as Android's
// PrintPlugin.java: print({ html, name }). The page is laid out in a
// WKWebView of its own with JavaScript off; its pictures are inlined, so it
// needs no network.
@objc(PrintPlugin)
public class PrintPlugin: CAPPlugin, CAPBridgedPlugin, WKNavigationDelegate {
    public let identifier = "PrintPlugin"
    public let jsName = "Print"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise)
    ]

    private var web: WKWebView?
    private var pending: CAPPluginCall?
    private var jobName = "Page"

    @objc func print(_ call: CAPPluginCall) {
        guard let html = call.getString("html") else {
            call.reject("No page to print")
            return
        }
        DispatchQueue.main.async {
            self.jobName = call.getString("name") ?? "Page"
            self.pending = call
            let config = WKWebViewConfiguration()
            config.defaultWebpagePreferences.allowsContentJavaScript = false
            let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 600, height: 800), configuration: config)
            view.navigationDelegate = self
            self.web = view
            view.loadHTMLString(html, baseURL: nil)
        }
    }

    public func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.navigationType == .other ? .allow : .cancel)
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let call = pending else { return }
        pending = nil
        let info = UIPrintInfo(dictionary: nil)
        info.outputType = .general
        info.jobName = jobName
        let controller = UIPrintInteractionController.shared
        controller.printInfo = info
        controller.printFormatter = webView.viewPrintFormatter()
        controller.present(animated: true) { _, _, _ in
            self.web = nil
        }
        call.resolve()
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        pending?.reject("Couldn't lay out the page")
        pending = nil
    }
}
