// Waypage's home screen widgets on iOS (1.6.0): Keep reading, Feeds,
// Favourites and (1.9.0) a highlight a day, Android's set (0.29.0, 0.29.2) drawn from the same data, which
// the app writes to the App Group (WidgetsPlugin, WPStore.widgets). A tap
// opens the app on what was tapped through a waypage-widget:// link, read
// by WidgetsPlugin. Android's collection widget isn't here yet: picking the
// collection would want an App Intent configuration.
import SwiftUI
import WidgetKit

// ---- Looks: Paper's tokens, and Night's in dark mode (src/styles.css) ----
private func color(_ light: UInt32, _ dark: UInt32) -> Color {
    Color(UIColor { t in
        let v = t.userInterfaceStyle == .dark ? dark : light
        return UIColor(red: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: 1)
    })
}
private let bg = color(0xF7F4EE, 0x0F1216)
private let ink = color(0x1C1B19, 0xE6E2D9)
private let muted = color(0x5E5A53, 0x9AA1AB)
private let accent = color(0x2F5D8A, 0x8DB4E2)

private func link(_ s: String) -> URL { URL(string: s) ?? URL(string: "waypage-widget://library")! }
private func pageLink(_ id: String) -> URL {
    link("waypage-widget://page/" + (id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? id))
}
private func query(_ base: String, _ name: String, _ value: String) -> URL {
    var c = URLComponents(string: base)
    c?.queryItems = [URLQueryItem(name: name, value: value)]
    return c?.url ?? link(base)
}

private func str(_ o: [String: Any]?, _ k: String) -> String { (o?[k] as? String) ?? "" }

// ---- The timeline: the app reloads it whenever it writes ----
struct WPEntry: TimelineEntry {
    let date: Date
    let data: [String: Any]
    let waiting: Int
}

struct WPProvider: TimelineProvider {
    func placeholder(in context: Context) -> WPEntry { WPEntry(date: Date(), data: [:], waiting: 0) }
    func getSnapshot(in context: Context, completion: @escaping (WPEntry) -> Void) {
        completion(WPEntry(date: Date(), data: WPStore.widgets(), waiting: WPStore.waitingCount()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WPEntry>) -> Void) {
        let e = WPEntry(date: Date(), data: WPStore.widgets(), waiting: WPStore.waitingCount())
        completion(Timeline(entries: [e], policy: .never))
    }
}

private struct Head: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 12, weight: .semibold)).foregroundStyle(muted).lineLimit(1)
    }
}

private struct Note: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 13)).foregroundStyle(muted).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct Row: View {
    let title: String
    let meta: String
    let url: URL
    var body: some View {
        Link(destination: url) {
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 14, weight: .semibold, design: .serif)).foregroundStyle(ink).lineLimit(1)
                if !meta.isEmpty { Text(meta).font(.system(size: 11)).foregroundStyle(muted).lineLimit(1) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// ---- Keep reading ----
struct ReadingView: View {
    @Environment(\.widgetFamily) var family
    let entry: WPEntry
    var body: some View {
        let r = entry.data["reading"] as? [String: Any]
        let id = str(r, "id")
        let at = min(1, max(0, (r?["at"] as? NSNumber)?.doubleValue ?? 0))
        Group {
            if family == .accessoryRectangular {
                VStack(alignment: .leading, spacing: 2) {
                    Text(id.isEmpty ? "Nothing open yet" : str(r, "title")).font(.headline).lineLimit(2)
                    if !id.isEmpty { ProgressView(value: at) }
                }
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Head(text: "Keep reading")
                    Text(id.isEmpty ? "Nothing open yet" : str(r, "title"))
                        .font(.system(size: 17, weight: .semibold, design: .serif)).foregroundStyle(ink)
                        .lineLimit(family == .systemSmall ? 3 : 2)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    Text(id.isEmpty ? "Save a clip, and it waits here." : str(r, "meta")).font(.system(size: 12)).foregroundStyle(muted).lineLimit(1)
                    if !id.isEmpty {
                        ProgressView(value: at).tint(accent)
                    }
                }
            }
        }
        .widgetURL(id.isEmpty ? link("waypage-widget://library") : pageLink(id))
        .containerBackground(for: .widget) { bg }
    }
}

struct ReadingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaypageReading", provider: WPProvider()) { ReadingView(entry: $0) }
            .configurationDisplayName("Keep reading")
            .description("The clip you were reading, one tap from where you left it.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

// ---- Feeds ----
struct FeedsView: View {
    @Environment(\.widgetFamily) var family
    let entry: WPEntry
    var body: some View {
        let f = entry.data["feeds"] as? [String: Any]
        let posts = (f?["posts"] as? [[String: Any]]) ?? []
        let fresh = ((f?["fresh"] as? NSNumber)?.intValue ?? 0) + entry.waiting
        let shown = Array(posts.prefix(family == .systemLarge ? 6 : 3))
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Head(text: "Feeds")
                Spacer()
                if fresh > 0 { Text("\(fresh) new").font(.system(size: 12, weight: .semibold)).foregroundStyle(accent) }
            }
            if shown.isEmpty {
                Note(text: (f?["following"] as? Bool) == true ? "No new posts." : "Follow a site in Feeds, and its newest posts show here.")
            } else {
                ForEach(0..<shown.count, id: \.self) { i in
                    Row(title: str(shown[i], "title"), meta: str(shown[i], "site"), url: query("waypage-widget://post", "url", str(shown[i], "url")))
                }
                Spacer(minLength: 0)
            }
        }
        .widgetURL(link("waypage-widget://feeds"))
        .containerBackground(for: .widget) { bg }
    }
}

struct FeedsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaypageFeeds", provider: WPProvider()) { FeedsView(entry: $0) }
            .configurationDisplayName("Feeds")
            .description("The newest posts from the sites you follow.")
            .supportedFamilies([.systemMedium, .systemLarge])
    }
}

// ---- Favourites ----
struct FavouritesView: View {
    let entry: WPEntry
    var body: some View {
        let list = Array(((entry.data["favourites"] as? [[String: Any]]) ?? []).prefix(4))
        VStack(alignment: .leading, spacing: 8) {
            Head(text: "Favourites")
            if list.isEmpty {
                Note(text: "Hold a clip in Waypage and tap Favourite, and it shows here.")
            } else {
                ForEach(0..<list.count, id: \.self) { i in
                    let p = list[i]
                    Row(title: str(p, "title"), meta: str(p, "meta"),
                        url: str(p, "kind") == "collection" ? query("waypage-widget://collection", "name", str(p, "name")) : pageLink(str(p, "id")))
                }
                Spacer(minLength: 0)
            }
        }
        .widgetURL(link("waypage-widget://favourites"))
        .containerBackground(for: .widget) { bg }
    }
}

struct FavouritesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaypageFavourites", provider: WPProvider()) { FavouritesView(entry: $0) }
            .configurationDisplayName("Favourites")
            .description("Your favourite collections and clips, one tap away.")
            .supportedFamilies([.systemMedium, .systemLarge])
    }
}

// ---- A highlight a day (1.9.0) ----
// The app's highlights, latest first; each day shows the one for its date,
// so the timeline holds a week of midnights and asks again after them.
struct MarkProvider: TimelineProvider {
    func placeholder(in context: Context) -> WPEntry { WPEntry(date: Date(), data: [:], waiting: 0) }
    func getSnapshot(in context: Context, completion: @escaping (WPEntry) -> Void) {
        completion(WPEntry(date: Date(), data: WPStore.widgets(), waiting: 0))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WPEntry>) -> Void) {
        let data = WPStore.widgets()
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        var entries = [WPEntry(date: Date(), data: data, waiting: 0)]
        for d in 1...7 {
            if let at = cal.date(byAdding: .day, value: d, to: today) { entries.append(WPEntry(date: at, data: data, waiting: 0)) }
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

private func dayNumber(_ date: Date) -> Int {
    let local = date.timeIntervalSince1970 + Double(TimeZone.current.secondsFromGMT(for: date))
    return Int(floor(local / 86400))
}

struct HighlightView: View {
    @Environment(\.widgetFamily) var family
    let entry: WPEntry
    var body: some View {
        let list = (entry.data["marks"] as? [[String: Any]]) ?? []
        let m: [String: Any]? = list.isEmpty ? nil : list[((dayNumber(entry.date) % list.count) + list.count) % list.count]
        let note = str(m, "note")
        VStack(alignment: .leading, spacing: 6) {
            Head(text: "A highlight")
            if m == nil {
                Note(text: "Select words in a clip and tap Highlight. One of your highlights shows here each day.")
            } else {
                Text("\u{201C}" + str(m, "text") + "\u{201D}")
                    .font(.system(size: family == .systemSmall ? 14 : 15, design: .serif)).foregroundStyle(ink)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                if !note.isEmpty { Text(note).font(.system(size: 12).italic()).foregroundStyle(muted).lineLimit(2) }
                Text(str(m, "title")).font(.system(size: 12, weight: .semibold)).foregroundStyle(accent).lineLimit(1)
            }
        }
        .widgetURL(m == nil ? link("waypage-widget://library") : query("waypage-widget://mark/" + (str(m, "id").addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? ""), "mark", str(m, "mark")))
        .containerBackground(for: .widget) { bg }
    }
}

struct HighlightWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaypageHighlight", provider: MarkProvider()) { HighlightView(entry: $0) }
            .configurationDisplayName("A highlight")
            .description("One of your highlights, a different one each day.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct WaypageWidgets: WidgetBundle {
    var body: some Widget {
        ReadingWidget()
        FeedsWidget()
        FavouritesWidget()
        HighlightWidget()
    }
}
