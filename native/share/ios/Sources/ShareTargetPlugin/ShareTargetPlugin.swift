import Capacitor
import UIKit
import UniformTypeIdentifiers

// Pages and files handed to Waypage (src/app.js, saveShared), the same calls
// as Android's ShareTargetPlugin.java: take() once, and a "shared" event when
// something arrives while the app is running.
//
// On iOS they come three ways (1.6.0):
//   - a link from the share sheet, through the share extension, which opens
//     waypage://share?id=…&text=… and, in case that open doesn't happen,
//     also leaves it in the App Group (WPStore.shares), taken next time;
//   - a file opened in Waypage from Files, Mail or another app ("Open in"),
//     whose document types tools/ios-project.js puts in Info.plist;
//   - both arriving as an open-URL event, which Capacitor's AppDelegate posts.
//
// A file is copied to tmp/incoming like Android's cache/incoming, and when
// iOS opened it in place (from the Files app), a bookmark of where it is
// comes back as `link`, so it can be read from there (FilesPlugin's refs).
@objc(ShareTargetPlugin)
public class ShareTargetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShareTargetPlugin"
    public let jsName = "ShareTarget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "take", returnType: CAPPluginReturnPromise)
    ]

    private var pendingFile: (URL, Bool)?
    private var pendingText: [String: Any]?
    private var lastHandled: URL?

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(opened(_:)), name: Notification.Name.capacitorOpenURL, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(active), name: UIApplication.didBecomeActiveNotification, object: nil)
        if let url = ApplicationDelegateProxy.shared.lastURL { _ = handle(url, inPlace: false) }
    }

    @objc private func opened(_ note: Notification) {
        guard let o = note.object as? [String: Any], let url = o["url"] as? URL else { return }
        let options = o["options"] as? [UIApplication.OpenURLOptionsKey: Any]
        let inPlace = (options?[.openInPlace] as? Bool) ?? false
        if handle(url, inPlace: inPlace) { notifyListeners("shared", data: [:], retainUntilConsumed: true) }
    }

    // A share left in the App Group while the app was in the background.
    @objc private func active() {
        if !WPStore.shares().isEmpty { notifyListeners("shared", data: [:]) }
    }

    private func handle(_ url: URL, inPlace: Bool) -> Bool {
        if url == lastHandled { return false }
        if url.isFileURL {
            lastHandled = url
            pendingFile = (url, inPlace)
            pendingText = nil
            return true
        }
        guard url.scheme == "waypage", url.host == "share",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              let text = items.first(where: { $0.name == "text" })?.value, !text.isEmpty else { return false }
        lastHandled = url
        if let id = items.first(where: { $0.name == "id" })?.value { WPStore.dropShare(id) }
        var out: [String: Any] = ["text": text]
        if let s = items.first(where: { $0.name == "subject" })?.value, !s.isEmpty { out["subject"] = s }
        pendingText = out
        return true
    }

    @objc func take(_ call: CAPPluginCall) {
        if let (url, inPlace) = pendingFile {
            pendingFile = nil
            DispatchQueue.global(qos: .userInitiated).async {
                do { call.resolve(try self.copy(url, inPlace: inPlace)) } catch { call.reject("Couldn't read the file") }
            }
            return
        }
        if let t = pendingText {
            pendingText = nil
            call.resolve(t)
            return
        }
        // Several waiting shares go together, as several links: the app
        // offers them as one batch to save.
        let q = WPStore.takeShares()
        let texts = q.compactMap { $0["text"] as? String }.filter { !$0.isEmpty }
        if texts.isEmpty { call.resolve([:]); return }
        var out: [String: Any] = ["text": texts.joined(separator: "\n")]
        if texts.count == 1, let s = q.first?["subject"] as? String, !s.isEmpty { out["subject"] = s }
        call.resolve(out)
    }

    // The file into tmp/incoming under its own name; only the newest is kept.
    private func copy(_ url: URL, inPlace: Bool) throws -> [String: Any] {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let fm = FileManager.default
        let dir = fm.temporaryDirectory.appendingPathComponent("incoming", isDirectory: true)
        try? fm.removeItem(at: dir)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        var name = url.lastPathComponent
        name = name.components(separatedBy: CharacterSet(charactersIn: "\\/:*?\"<>|")).joined(separator: "_")
        if name.isEmpty { name = "file" }
        let out = dir.appendingPathComponent(name)
        var err: NSError?
        var copyErr: Error?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [.withoutChanges], error: &err) { at in
            do { try fm.copyItem(at: at, to: out) } catch { copyErr = error }
        }
        if let e = err { throw e }
        if let e = copyErr { throw e }
        // What iOS copied into Documents/Inbox for us isn't needed twice.
        if !inPlace, url.path.contains("/Documents/Inbox/") { try? fm.removeItem(at: url) }
        var file: [String: Any] = ["uri": out.absoluteString, "name": name]
        if let t = UTType(filenameExtension: url.pathExtension), let m = t.preferredMIMEType { file["mime"] = m }
        if inPlace, let ref = FilesPlugin.bookmark(url) { file["link"] = ref }
        return ["file": file]
    }
}
