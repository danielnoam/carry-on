import BackgroundTasks
import Capacitor
import UIKit
import UserNotifications
#if canImport(WidgetKit)
import WidgetKit
#endif

// Feeds checked with the app closed, on iOS (1.6.0): the same calls as
// Android's FeedsPlugin.java,
//
//   watch({ feeds: [{ url, title, known }], ask })   the feeds to read and the
//                 posts the app has; none stops the checks. `ask` asks to notify.
//   news()        { feeds: [url], open } once: the feeds with new posts since,
//                 and whether the app was opened from the notification.
//
// and an "open" event when the notification brings the running app back.
//
// Android runs a job every three hours; iOS runs a background refresh when
// it decides to, often hours late and less for an app that's rarely opened.
// The check itself is FeedCheck below, a port of FeedCheckJob.java: nothing
// is saved, it only notices new posts and says so.
//
// BGTaskScheduler wants its handler registered before the app finishes
// launching, earlier than any plugin loads, so tools/ios-project.js has the
// AppDelegate call FeedsPlugin.registerBackground().
@objc(FeedsPlugin)
public class FeedsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FeedsPlugin"
    public let jsName = "Feeds"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "watch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "news", returnType: CAPPluginReturnPromise)
    ]

    static let task = "io.github.danielnoam.waypage.feeds"
    static let openedNote = Notification.Name("WaypageFeedsOpened")

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(opened), name: FeedsPlugin.openedNote, object: nil)
    }

    @objc private func opened() {
        notifyListeners("open", data: [:], retainUntilConsumed: true)
    }

    @objc public static func registerBackground() {
        UNUserNotificationCenter.current().delegate = NoteTaps.shared
        BGTaskScheduler.shared.register(forTaskWithIdentifier: task, using: nil) { t in
            guard let refresh = t as? BGAppRefreshTask else { t.setTaskCompleted(success: false); return }
            FeedsPlugin.schedule(true)
            let check = FeedCheck()
            refresh.expirationHandler = { check.stop() }
            check.run { refresh.setTaskCompleted(success: true) }
        }
    }

    static func schedule(_ on: Bool) {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: task)
        guard on else { return }
        let r = BGAppRefreshTaskRequest(identifier: task)
        r.earliestBeginDate = Date(timeIntervalSinceNow: 3 * 60 * 60)
        try? BGTaskScheduler.shared.submit(r)
    }

    @objc func watch(_ call: CAPPluginCall) {
        let feeds = call.getArray("feeds") ?? []
        WPStore.write("feeds.json", feeds)
        FeedsPlugin.schedule(!feeds.isEmpty)
        if call.getBool("ask") ?? false {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
        }
        call.resolve()
    }

    @objc func news(_ call: CAPPluginCall) {
        let waiting = (WPStore.read("feeds-waiting.json") as? [String: Any]) ?? [:]
        FeedCheck.clear()
        let open = NoteTaps.shared.opened
        NoteTaps.shared.opened = false
        call.resolve(["feeds": Array(waiting.keys), "open": open])
    }
}

// A tap on the notification, which can come before any plugin has loaded.
final class NoteTaps: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NoteTaps()
    var opened = false

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler done: @escaping () -> Void) {
        if response.notification.request.identifier == FeedCheck.noteId {
            opened = true
            NotificationCenter.default.post(name: FeedsPlugin.openedNote, object: nil)
        }
        done()
    }

    // With the app open the posts are already in Feeds; no banner.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
        done([])
    }
}

final class FeedCheck {
    static let noteId = "waypage-feeds"
    private static let maxItems = 50
    private static let maxTold = 300
    private static let maxBytes = 4 * 1024 * 1024
    private static let accept = "application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8"
    private static let agent = "Mozilla/5.0 (iPhone; CPU iPhone OS like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile Waypage (offline reader; https://github.com/danielnoam/waypage)"

    private var stopped = false
    private let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 20
        c.timeoutIntervalForResource = 40
        return URLSession(configuration: c)
    }()

    func stop() {
        stopped = true
        session.invalidateAndCancel()
    }

    func run(_ done: @escaping () -> Void) {
        DispatchQueue.global(qos: .utility).async {
            self.check()
            done()
        }
    }

    private func check() {
        let watch = (WPStore.read("feeds.json") as? [[String: Any]]) ?? []
        if watch.isEmpty { return }
        var told = (WPStore.read("feeds-told.json") as? [String: [String]]) ?? [:]
        var waiting = (WPStore.read("feeds-waiting.json") as? [String: [String: Any]]) ?? [:]
        var found = false
        for f in watch {
            if stopped { break }
            guard let address = f["url"] as? String, address.hasPrefix("http"), let url = URL(string: address) else { continue }
            guard let posts = read(url) else { continue }
            var known = Set((f["known"] as? [String]) ?? [])
            let t = told[address] ?? []
            known.formUnion(t)
            var fresh: [String] = []
            var n = 0
            for keys in posts where !keys.contains(where: { known.contains($0) }) {
                fresh += keys
                n += 1
            }
            if n == 0 { continue }
            told[address] = Array((fresh + t).prefix(FeedCheck.maxTold))
            var w = waiting[address] ?? ["title": f["title"] as? String ?? "", "count": 0]
            w["count"] = ((w["count"] as? NSNumber)?.intValue ?? 0) + n
            waiting[address] = w
            found = true
        }
        if !found { return }
        WPStore.write("feeds-told.json", told)
        WPStore.write("feeds-waiting.json", waiting)
        FeedCheck.notify(waiting)
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }

    // ---- Reading a feed: each post as the set of ids it can go by ----

    private func read(_ url: URL) -> [[String]]? {
        var req = URLRequest(url: url)
        req.setValue(FeedCheck.accept, forHTTPHeaderField: "Accept")
        req.setValue(FeedCheck.agent, forHTTPHeaderField: "User-Agent")
        let wait = DispatchSemaphore(value: 0)
        var body: Data?
        var final = url
        session.dataTask(with: req) { data, res, _ in
            if let h = res as? HTTPURLResponse, h.statusCode == 200, let d = data, d.count <= FeedCheck.maxBytes {
                body = d
                final = h.url ?? url
            }
            wait.signal()
        }.resume()
        wait.wait()
        guard let d = body else { return nil }
        let first = d.first { !($0 == 0x20 || $0 == 0x09 || $0 == 0x0a || $0 == 0x0d || $0 >= 0xef) }
        if first == UInt8(ascii: "{") { return FeedCheck.fromJson(d, final) }
        return PostsParser(base: final).parse(d)
    }

    private static func fromJson(_ d: Data, _ base: URL) -> [[String]] {
        guard let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let items = o["items"] as? [[String: Any]] else { return [] }
        var out: [[String]] = []
        for it in items.prefix(maxItems) {
            var post: [String] = []
            if let id = it["id"] { add(&post, clean("\(id)")) }
            add(&post, absolute(it["url"] as? String, base))
            add(&post, absolute(it["external_url"] as? String, base))
            if !post.isEmpty { out.append(post) }
        }
        return out
    }

    // As src/feeds.js's clean(): spaces run together, ends trimmed.
    static func clean(_ s: String) -> String {
        let v = s.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
        return v.count > 500 ? String(v.prefix(500)) : v
    }

    static func absolute(_ href: String?, _ base: URL) -> String? {
        guard let h = href?.trimmingCharacters(in: .whitespacesAndNewlines), !h.isEmpty,
              let u = URL(string: h, relativeTo: base)?.absoluteURL, u.scheme == "http" || u.scheme == "https" else { return nil }
        return u.absoluteString
    }

    static func add(_ post: inout [String], _ key: String?) {
        if let k = key, !k.isEmpty, !post.contains(k) { post.append(k) }
    }

    // ---- The notification ----

    static func notify(_ waiting: [String: [String: Any]]) {
        var total = 0
        var names: [String] = []
        for w in waiting.values {
            let c = (w["count"] as? NSNumber)?.intValue ?? 0
            if c <= 0 { continue }
            total += c
            if let t = w["title"] as? String, !t.isEmpty { names.append(t) }
        }
        if total == 0 { return }
        let content = UNMutableNotificationContent()
        content.title = (total == 1 ? "A new post" : "\(total) new posts") + (names.count == 1 ? " from " + names[0] : "")
        content.body = names.count == 1 ? (total == 1 ? "Tap to see it in Feeds." : "Tap to see them in Feeds.")
            : names.count == 2 ? "From \(names[0]) and \(names[1])."
            : names.count > 2 ? "From \(names[0]), \(names[1]) and \(names.count - 2) more." : "In your feeds."
        content.threadIdentifier = noteId
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: noteId, content: content, trigger: nil))
    }

    static func clear() {
        WPStore.remove("feeds-waiting.json")
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [noteId])
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}

// RSS's <item> and Atom's <entry>: their guid, id and links.
private final class PostsParser: NSObject, XMLParserDelegate {
    let base: URL
    var out: [[String]] = []
    var post: [String]?
    var depth = 0
    var postDepth = -1
    var field: String?
    var text = ""

    init(base: URL) { self.base = base }

    func parse(_ d: Data) -> [[String]] {
        let p = XMLParser(data: d)
        p.delegate = self
        p.shouldProcessNamespaces = false
        p.parse()
        return out
    }

    private func local(_ name: String) -> String {
        guard let i = name.firstIndex(of: ":") else { return name }
        return String(name[name.index(after: i)...])
    }

    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String] = [:]) {
        depth += 1
        let n = local(name)
        if post == nil, n == "item" || n == "entry" {
            post = []
            postDepth = depth
        } else if post != nil, depth == postDepth + 1 {
            if n == "link", let href = attributes["href"], attributes["rel"] == nil || attributes["rel"] == "alternate" {
                FeedCheck.add(&post!, FeedCheck.absolute(href, base))
            }
            if n == "guid" || n == "id" || n == "link" {
                field = n
                text = ""
            }
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if field != nil { text += string }
    }

    func parser(_ parser: XMLParser, foundCDATA block: Data) {
        if field != nil { text += String(decoding: block, as: UTF8.self) }
    }

    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
        if post != nil, let f = field, depth == postDepth + 1 {
            let v = FeedCheck.clean(text)
            if !v.isEmpty, f == "link" { FeedCheck.add(&post!, FeedCheck.absolute(v, base)) }
            else if !v.isEmpty {
                FeedCheck.add(&post!, v)
                FeedCheck.add(&post!, FeedCheck.absolute(v, base))
            }
            field = nil
        } else if let p = post, depth == postDepth {
            if !p.isEmpty { out.append(p) }
            post = nil
            if out.count >= 50 { parser.abortParsing() }
        }
        depth -= 1
    }
}
