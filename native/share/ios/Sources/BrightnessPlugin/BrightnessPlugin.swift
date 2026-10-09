import Capacitor
import UIKit

// The reader's brightness (1.10.0), the same calls as Android's
// BrightnessPlugin.java. iOS's brightness is the whole phone's, and it
// stays after the app goes, so the level from before is put back when
// Waypage goes to the background or the reader lets go, and the reader's
// is set again when Waypage comes back.
//
//   get()            { level 0 to 1, system }
//   set({ level })   level 0 to 1, or no level for the one from before
@objc(BrightnessPlugin)
public class BrightnessPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BrightnessPlugin"
    public let jsName = "Brightness"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
    ]

    private var before: CGFloat?
    private var applied: CGFloat?

    override public func load() {
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(away), name: UIApplication.willResignActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(back), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    @objc private func away() {
        if let b = before, applied != nil { UIScreen.main.brightness = b }
    }

    @objc private func back() {
        guard let l = applied else { return }
        before = UIScreen.main.brightness
        UIScreen.main.brightness = l
    }

    @objc func get(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["level": Double(UIScreen.main.brightness), "system": self.applied == nil])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        let level = call.getDouble("level")
        DispatchQueue.main.async {
            if let l = level {
                if self.applied == nil { self.before = UIScreen.main.brightness }
                let v = CGFloat(max(0.01, min(1, l)))
                self.applied = v
                UIScreen.main.brightness = v
            } else {
                if let b = self.before, self.applied != nil { UIScreen.main.brightness = b }
                self.applied = nil
                self.before = nil
            }
            call.resolve()
        }
    }
}
