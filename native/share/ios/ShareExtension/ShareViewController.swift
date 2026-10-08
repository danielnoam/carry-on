// Waypage in iOS's share sheet (1.6.0), as on Android since 0.3.0: a link
// shared from Safari or any app is handed to the app, which saves it like a
// pasted link (src/app.js, saveShared).
//
// The extension doesn't save anything itself: the saving is the app's
// JavaScript. It leaves the link in the App Group (WPStore.addShare) and
// opens waypage://share?id=…&text=…, so the app comes up and saves it at
// once; if that open is refused, the app finds the link in the group the
// next time it comes to the front. Opening another app isn't something iOS
// offers a share extension, so it's done through the responder chain's
// UIApplication, called through the Objective-C runtime since an
// extension's code may not name UIApplication.open.
//
// Pages that draw themselves with scripts don't need Safari's JavaScript
// preprocessing file here: the app draws those itself (PageRenderPlugin).
import ObjectiveC
import UIKit
import UniformTypeIdentifiers

class ShareViewController: UIViewController {
    private let label = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor { $0.userInterfaceStyle == .dark ? UIColor(red: 0x0F / 255, green: 0x12 / 255, blue: 0x16 / 255, alpha: 1) : UIColor(red: 0xF7 / 255, green: 0xF4 / 255, blue: 0xEE / 255, alpha: 1) }
        label.text = "Saving in Waypage…"
        label.font = .preferredFont(forTextStyle: .headline)
        label.adjustsFontForContentSizeCategory = true
        label.textAlignment = .center
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        gather { text, subject in
            DispatchQueue.main.async { self.hand(text, subject) }
        }
    }

    // The shared link, or the shared text when it has one in it.
    private func gather(_ done: @escaping (String?, String?) -> Void) {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        let subject = items.first?.attributedContentText?.string ?? items.first?.attributedTitle?.string
        let providers = items.flatMap { $0.attachments ?? [] }
        if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.url.identifier) }) {
            p.loadItem(forTypeIdentifier: UTType.url.identifier) { v, _ in
                let url = (v as? URL) ?? (v as? NSURL as URL?) ?? (v as? String).flatMap(URL.init(string:))
                if let u = url, u.scheme == "http" || u.scheme == "https" { done(u.absoluteString, subject); return }
                done(subject, nil)
            }
            return
        }
        if let p = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }) {
            p.loadItem(forTypeIdentifier: UTType.plainText.identifier) { v, _ in
                done((v as? String) ?? (v as? NSAttributedString)?.string ?? subject, nil)
            }
            return
        }
        done(subject, nil)
    }

    private func hand(_ text: String?, _ subject: String?) {
        guard let text = text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
            finish("That share had no link in it.")
            return
        }
        let id = UUID().uuidString
        var item: [String: Any] = ["id": id, "text": text]
        if let s = subject, !s.isEmpty, s != text { item["subject"] = s }
        WPStore.addShare(item)
        var c = URLComponents()
        c.scheme = "waypage"
        c.host = "share"
        c.queryItems = [URLQueryItem(name: "id", value: id), URLQueryItem(name: "text", value: text)]
            + (item["subject"] != nil ? [URLQueryItem(name: "subject", value: subject)] : [])
        if let url = c.url, openApp(url) {
            extensionContext?.completeRequest(returningItems: nil)
            return
        }
        finish(WPStore.shared ? "Waypage saves it the next time you open it." : "Couldn't reach Waypage. Open it and paste the link instead.")
    }

    private func openApp(_ url: URL) -> Bool {
        typealias Open = @convention(c) (AnyObject, Selector, NSURL, NSDictionary, AnyObject?) -> Void
        let sel = NSSelectorFromString("openURL:options:completionHandler:")
        var r: UIResponder? = self
        while let at = r {
            if at is UIApplication, let m = class_getInstanceMethod(type(of: at), sel) {
                unsafeBitCast(method_getImplementation(m), to: Open.self)(at, sel, url as NSURL, NSDictionary(), nil)
                return true
            }
            r = at.next
        }
        return false
    }

    private func finish(_ message: String) {
        label.text = message
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            self.extensionContext?.completeRequest(returningItems: nil)
        }
    }
}
