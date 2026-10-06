import Capacitor
import UIKit

// Downloads (src/app.js, 0.27.9): the same calls as Android's
// DownloadsPlugin.java, update({ title, text, done, total }) and stop().
// iOS gives no way to keep the app's own work running in the background,
// so this holds a background task while anything is being saved: when the
// app is put away, the page in progress gets the half minute or so iOS
// allows, and the rest waits until the app is opened again.
@objc(DownloadsPlugin)
public class DownloadsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DownloadsPlugin"
    public let jsName = "Downloads"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private var task: UIBackgroundTaskIdentifier = .invalid

    @objc func update(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.task == .invalid {
                self.task = UIApplication.shared.beginBackgroundTask(withName: "Waypage downloads") { self.end() }
            }
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.end()
            call.resolve()
        }
    }

    private func end() {
        guard task != .invalid else { return }
        UIApplication.shared.endBackgroundTask(task)
        task = .invalid
    }
}
