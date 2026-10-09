import Capacitor
import UIKit
#if canImport(WidgetKit)
import WidgetKit
#endif

// Home screen widgets on iOS (1.6.0): the same calls as Android's
// WidgetsPlugin.java, so src/app.js's updateWidgets and takeWidget don't
// know which phone they're on.
//
//   update({ reading, feeds, favourites, collections })   what they draw,
//             written to the App Group for the widget extension (WPStore)
//   renamed({ from, to })   nothing to do: iOS has no collection widget yet
//   take()    { kind, id, url, name } once, what a widget's tap asked to open
//
// and an "open" event when a tap brings the running app back. A tap opens
// waypage-widget://page/<id>, …/post?url=…, …/feeds, …/library or
// …/favourites, which arrives as an open-URL event.
@objc(WidgetsPlugin)
public class WidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetsPlugin"
    public let jsName = "Widgets"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "renamed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "take", returnType: CAPPluginReturnPromise)
    ]

    private var pending: [String: Any]?
    private var lastHandled: URL?

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(opened(_:)), name: Notification.Name.capacitorOpenURL, object: nil)
        if let url = ApplicationDelegateProxy.shared.lastURL { _ = read(url) }
    }

    @objc private func opened(_ note: Notification) {
        guard let o = note.object as? [String: Any], let url = o["url"] as? URL else { return }
        if read(url) { notifyListeners("open", data: [:], retainUntilConsumed: true) }
    }

    private func read(_ url: URL) -> Bool {
        guard url.scheme == "waypage-widget", url != lastHandled, let kind = url.host, !kind.isEmpty else { return false }
        lastHandled = url
        let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        var out: [String: Any] = ["kind": kind]
        if kind == "page" || kind == "mark", let id = url.pathComponents.last, id != "/" { out["id"] = id }
        if kind == "mark" { out["mark"] = q.first { $0.name == "mark" }?.value ?? "" }
        if kind == "post" { out["url"] = q.first { $0.name == "url" }?.value ?? "" }
        if kind == "collection" { out["name"] = q.first { $0.name == "name" }?.value ?? "" }
        pending = out
        return true
    }

    @objc func update(_ call: CAPPluginCall) {
        var data: [String: Any] = [:]
        for (k, v) in call.options ?? [:] { if let key = k as? String { data[key] = v } }
        WPStore.write("widgets.json", data)
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        call.resolve()
    }

    @objc func renamed(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func take(_ call: CAPPluginCall) {
        let out = pending ?? [:]
        pending = nil
        call.resolve(out)
    }
}
