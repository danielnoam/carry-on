import Capacitor
import UIKit

// An exported file saved where the person picks, in the Files app (src/app.js,
// 0.25.2). The same call as Android's FileSavePlugin.java:
// save({ uri, name, mime }) resolves to { saved }, false when put away.
// `uri` is a file the app already wrote to its cache.
@objc(FileSavePlugin)
public class FileSavePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "FileSavePlugin"
    public let jsName = "FileSave"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise)
    ]

    private var pending: CAPPluginCall?

    @objc func save(_ call: CAPPluginCall) {
        guard let raw = call.getString("uri") else {
            call.reject("No file to save")
            return
        }
        let url = URL(string: raw).flatMap { $0.isFileURL ? $0 : nil }
            ?? URL(fileURLWithPath: raw.replacingOccurrences(of: "file://", with: ""))
        DispatchQueue.main.async {
            self.pending?.resolve(["saved": false])
            self.pending = call
            let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
            picker.delegate = self
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        pending?.resolve(["saved": true])
        pending = nil
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pending?.resolve(["saved": false])
        pending = nil
    }
}
