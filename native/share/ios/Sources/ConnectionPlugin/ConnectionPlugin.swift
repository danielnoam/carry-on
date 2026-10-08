import Capacitor
import Network

// Whether the phone is on mobile data (1.6.0), for Saving's and Sync's
// "Wait for Wi-Fi" (1.4.1). Android's WebView says so in
// navigator.connection; iOS's says nothing, so this asks the system:
//
//   state()    { metered }: on a cellular connection, or one iOS calls
//              expensive (a phone's hotspot)
//
// and a "change" event { metered } whenever that changes.
@objc(ConnectionPlugin)
public class ConnectionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ConnectionPlugin"
    public let jsName = "Connection"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise)
    ]

    private let monitor = NWPathMonitor()
    private var metered = false

    override public func load() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }
            let now = path.status == .satisfied && (path.usesInterfaceType(.cellular) || path.isExpensive)
            if now == self.metered { return }
            self.metered = now
            self.notifyListeners("change", data: ["metered": now])
        }
        monitor.start(queue: DispatchQueue(label: "waypage.connection"))
    }

    @objc func state(_ call: CAPPluginCall) {
        let path = monitor.currentPath
        call.resolve(["metered": path.status == .satisfied && (path.usesInterfaceType(.cellular) || path.isExpensive)])
    }
}
