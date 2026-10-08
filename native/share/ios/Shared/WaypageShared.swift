// What Waypage's app, its share extension and its widgets hand each other
// (1.6.0), compiled into all three: the app's plugins (WaypageShare.podspec)
// and both extensions (tools/ios-extensions.rb). Foundation only, since an
// extension can't link Capacitor.
//
// The three are separate processes and meet in an App Group's folder.
// AltStore and SideStore register the group under a name of their own when
// they sign the app and write that name into Info.plist's ALTAppGroups, so
// the name is read from there first (as LifeLog's widgets do).
//
//   widgets.json   what the widgets draw, written by the app (WidgetsPlugin)
//   shares.json    links shared to Waypage while it was closed, oldest first
//   feeds.json     followed feeds and the posts they have (FeedsPlugin)
//   feeds-told.json / feeds-waiting.json   what the background check found
import Foundation

enum WPGroup {
    static let fallback = "group.io.github.danielnoam.waypage"

    static var candidates: [String] {
        var out: [String] = []
        if let alt = Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String] { out += alt }
        out.append(fallback)
        return out
    }

    static var container: URL? {
        for id in candidates {
            if let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id) { return url }
        }
        return nil
    }
}

enum WPStore {
    // The group's folder, or the app's own Library when there's no group (an
    // .ipa signed without one): the app still works, only the extensions
    // can't see what it wrote.
    static var folder: URL {
        if let g = WPGroup.container { return g }
        return FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
    }

    static var shared: Bool { WPGroup.container != nil }

    static func read(_ name: String) -> Any? {
        guard let d = try? Data(contentsOf: folder.appendingPathComponent(name)) else { return nil }
        return try? JSONSerialization.jsonObject(with: d)
    }

    static func write(_ name: String, _ value: Any) {
        let url = folder.appendingPathComponent(name)
        guard let d = try? JSONSerialization.data(withJSONObject: value) else { return }
        try? d.write(to: url, options: .atomic)
    }

    static func remove(_ name: String) {
        try? FileManager.default.removeItem(at: folder.appendingPathComponent(name))
    }

    // ---- Shared links: [{ id, text, subject }] ----

    static func shares() -> [[String: Any]] { (read("shares.json") as? [[String: Any]]) ?? [] }

    static func addShare(_ item: [String: Any]) {
        var q = shares()
        q.append(item)
        write("shares.json", Array(q.suffix(50)))
    }

    static func takeShares() -> [[String: Any]] {
        let q = shares()
        if !q.isEmpty { remove("shares.json") }
        return q
    }

    static func dropShare(_ id: String) {
        let q = shares().filter { ($0["id"] as? String) != id }
        if q.isEmpty { remove("shares.json") } else { write("shares.json", q) }
    }

    // ---- Widgets ----

    static func widgets() -> [String: Any] { (read("widgets.json") as? [String: Any]) ?? [:] }

    // New posts the background check found and the app hasn't read yet.
    static func waitingCount() -> Int {
        let w = (read("feeds-waiting.json") as? [String: [String: Any]]) ?? [:]
        return w.values.reduce(0) { $0 + ((($1["count"] as? NSNumber)?.intValue) ?? 0) }
    }
}
