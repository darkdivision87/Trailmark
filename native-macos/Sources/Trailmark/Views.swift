import AppKit
import SwiftUI

private let accent = Color(red: 0.78, green: 0.88, blue: 0.62)

struct WidgetView: View {
    let module: Module
    @ObservedObject var model: DashboardModel
    @State private var volume: Double = 50
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(module.title.uppercased()).font(.system(size: 10, weight: .semibold, design: .monospaced)).tracking(2)
                Spacer()
                Circle().fill(accent).frame(width: 4, height: 4)
            }.foregroundStyle(.white.opacity(0.55))
            content.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
        .padding(18)
        .foregroundStyle(.white)
        .background(Color(red: 0.055, green: 0.065, blue: 0.065).opacity(model.opacity))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(.white.opacity(0.08)))
        .preferredColorScheme(.dark)
    }
    @ViewBuilder private var content: some View {
        switch module {
        case .clock:
            VStack(alignment: .leading, spacing: 5) {
                Text(model.now, style: .time).font(.system(size: 38, weight: .light)).monospacedDigit()
                Text(model.now.formatted(.dateTime.weekday(.wide).month(.wide).day())).font(.system(size: 13)).foregroundStyle(.white.opacity(0.65))
            }
        case .calendar: CalendarGrid(date: model.now)
        case .system:
            VStack(alignment: .leading, spacing: 14) {
                meter("CPU", value: model.cpu, detail: String(format: "%.0f%%", model.cpu * 100))
                meter("MEMORY", value: model.memory / model.memoryTotal, detail: "\(bytes(model.memory)) / \(bytes(model.memoryTotal))")
                Text("ACTIVE + WIRED + COMPRESSED").font(.system(size: 8, design: .monospaced)).foregroundStyle(.secondary)
            }
        case .disk:
            VStack(alignment: .leading, spacing: 10) {
                Text(bytes(model.diskTotal - model.diskUsed)).font(.system(size: 32, weight: .light))
                Text("AVAILABLE ON HOME VOLUME").font(.system(size: 8, design: .monospaced)).foregroundStyle(.secondary)
                meter("USED", value: model.diskTotal > 0 ? model.diskUsed / model.diskTotal : 0, detail: bytes(model.diskUsed))
            }
        case .network:
            VStack(spacing: 12) {
                row("LOCAL IP", model.address)
                row("↑ UPLOAD", "\(bytes(model.upload))/s")
                row("↓ DOWNLOAD", "\(bytes(model.download))/s")
            }
        case .world:
            VStack(spacing: 10) {
                ForEach(Array(model.zones.split(separator: ",").prefix(4).enumerated()), id: \.offset) { _, identifier in
                    if let zone = TimeZone(identifier: String(identifier).trimmingCharacters(in: .whitespaces)) {
                        row(zone.identifier.split(separator: "/").last.map(String.init)?.replacingOccurrences(of: "_", with: " ") ?? zone.identifier, model.now.formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: zone)))
                    }
                }
            }
        case .analog: AnalogClock(date: model.now).frame(maxWidth: .infinity)
        case .moon:
            let phase = Astronomy.phase(at: model.now)
            VStack(spacing: 8) {
                Text(["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"][Int((phase * 8 + 0.5).rounded(.down)) % 8]).font(.system(size: 62))
                Text(Astronomy.name(phase)).font(.system(size: 12))
                Text("\(Int((1 - cos(2 * .pi * phase)) * 50))% illuminated · approximate").font(.system(size: 9)).foregroundStyle(.secondary)
            }.frame(maxWidth: .infinity)
        case .timer:
            VStack(alignment: .leading, spacing: 10) {
                let seconds = Int(ceil(model.countdown.seconds(at: model.now)))
                Text(String(format: "%02d:%02d", seconds / 60, seconds % 60)).font(.system(size: 36, weight: .light, design: .monospaced))
                HStack {
                    Button(model.countdown.deadline == nil ? "Start" : "Pause") {
                        if model.countdown.deadline == nil { model.countdown.start(at: Date()) }
                        else { model.countdown.pause(at: Date()) }
                    }.tint(accent)
                    ForEach([5, 15, 25], id: \.self) { minutes in Button("\(minutes)m") { model.countdown.reset(minutes: minutes) } }
                }.buttonStyle(.bordered).controlSize(.small)
            }
        case .headlines:
            VStack(alignment: .leading, spacing: 8) {
                if model.headlines.isEmpty { Text(model.feedStatus).font(.system(size: 12)).foregroundStyle(.secondary) }
                ForEach(model.headlines.prefix(3)) { item in
                    if let url = item.url { Link(destination: url) { Text(item.title).lineLimit(2).frame(maxWidth: .infinity, alignment: .leading) }.foregroundStyle(.white.opacity(0.85)) }
                    else { Text(item.title).lineLimit(2) }
                }
            }.font(.system(size: 11))
        case .controls:
            VStack(alignment: .leading, spacing: 14) {
                Label("Output volume", systemImage: "speaker.wave.2").font(.system(size: 12))
                Slider(value: $volume, in: 0...100, onEditingChanged: { editing in if !editing { model.setVolume(volume) } }).tint(accent)
                Button("Open Display Settings ↗") {
                    if let url = URL(string: "x-apple.systempreferences:com.apple.Displays-Settings.extension") { NSWorkspace.shared.open(url) }
                }.buttonStyle(.plain).font(.system(size: 11)).foregroundStyle(.secondary)
            }.onAppear {
                var error: NSDictionary?
                if let result = NSAppleScript(source: "output volume of (get volume settings)")?.executeAndReturnError(&error), error == nil { volume = Double(result.int32Value) }
            }
        }
    }
    private func meter(_ title: String, value: Double, detail: String) -> some View {
        VStack(spacing: 6) {
            row(title, detail)
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.12))
                    Capsule().fill(accent).frame(width: geometry.size.width * min(1, max(0, value)))
                }
            }.frame(height: 3)
        }
    }
    private func row(_ title: String, _ value: String) -> some View {
        HStack { Text(title).foregroundStyle(.secondary); Spacer(); Text(value).monospacedDigit() }.font(.system(size: 11))
    }
    private func bytes(_ value: Double) -> String { ByteCountFormatter.string(fromByteCount: Int64(max(0, value)), countStyle: .binary) }
}

struct CalendarGrid: View {
    let date: Date
    private var calendar: Calendar { Calendar.current }
    var body: some View {
        let start = calendar.dateInterval(of: .month, for: date)?.start ?? date
        let days = calendar.range(of: .day, in: .month, for: date) ?? 1..<29
        let offset = (calendar.component(.weekday, from: start) - calendar.firstWeekday + 7) % 7
        VStack(alignment: .leading, spacing: 10) {
            Text(date.formatted(.dateTime.month(.wide).year())).font(.system(size: 13, weight: .medium))
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7), spacing: 5) {
                ForEach(0..<7, id: \.self) { index in
                    Text(calendar.veryShortStandaloneWeekdaySymbols[(index + calendar.firstWeekday - 1) % 7]).foregroundStyle(.secondary)
                }
                ForEach(0..<(offset + days.count), id: \.self) { index in
                    let day = index - offset + 1
                    Text(index < offset ? "" : "\(day)")
                        .frame(maxWidth: .infinity).frame(height: 18)
                        .background(day == calendar.component(.day, from: date) ? accent.opacity(0.3) : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 4))
                }
            }.font(.system(size: 10, design: .monospaced))
        }
    }
}

struct AnalogClock: View {
    let date: Date
    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = min(size.width, size.height) / 2 - 4
            let circle = Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
            context.stroke(circle, with: .color(.white.opacity(0.2)), lineWidth: 1)
            for tick in 0..<60 {
                let angle = Double(tick) / 60 * .pi * 2
                let inner = radius - (tick % 5 == 0 ? 9 : 4)
                var path = Path()
                path.move(to: CGPoint(x: center.x + sin(angle) * inner, y: center.y - cos(angle) * inner))
                path.addLine(to: CGPoint(x: center.x + sin(angle) * radius, y: center.y - cos(angle) * radius))
                context.stroke(path, with: .color(.white.opacity(0.55)), lineWidth: 1)
            }
            let components = Calendar.current.dateComponents([.hour, .minute, .second], from: date)
            let second = Double(components.second ?? 0)
            let minute = Double(components.minute ?? 0) + second / 60
            let hour = Double((components.hour ?? 0) % 12) + minute / 60
            for (angle, length, width, color) in [(hour / 12, 0.48, 3.0, Color.white), (minute / 60, 0.75, 2.0, Color.white), (second / 60, 0.82, 1.0, accent)] {
                var hand = Path(); hand.move(to: center)
                hand.addLine(to: CGPoint(x: center.x + sin(angle * .pi * 2) * radius * length, y: center.y - cos(angle * .pi * 2) * radius * length))
                context.stroke(hand, with: .color(color), style: StrokeStyle(lineWidth: width, lineCap: .round))
            }
        }.frame(width: 126, height: 126)
    }
}

struct PreferencesView: View {
    @ObservedObject var model: DashboardModel
    @State private var message = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("TRAILMARK").font(.system(size: 25, weight: .light, design: .monospaced)).tracking(4)
            Text("Your desktop. Your instruments.").foregroundStyle(.secondary)
            Text("Drag a widget background to place it. Use the grid icon in the menu bar to select modules, hide widgets, or lock them for click through.").font(.system(size: 12))
            VStack(alignment: .leading) {
                Text("Panel opacity").font(.caption)
                Slider(value: $model.opacity, in: 0.05...1)
            }
            VStack(alignment: .leading) {
                Text("RSS / Atom feed (HTTPS)").font(.caption)
                TextField("https://example.com/feed.xml", text: $model.feedURL)
            }
            VStack(alignment: .leading) {
                Text("World clocks · up to four IANA time zones, separated by commas").font(.caption)
                TextField("America/New_York,Europe/Lisbon", text: $model.zones)
            }
            HStack {
                Button("Save & refresh") {
                    let zones = model.zones.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) }
                    guard !zones.isEmpty, zones.count <= 4, zones.allSatisfy({ TimeZone(identifier: $0) != nil }) else { message = "Enter 1–4 valid IANA time zones."; return }
                    model.saveSettings(); message = "Saved. \(model.feedStatus)"
                }
                Text(message).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            Text("No account or API key. System data stays on your Mac. RSS connects only to the feed you choose.").font(.caption).foregroundStyle(.secondary)
        }.padding(28).frame(width: 480).preferredColorScheme(.dark)
    }
}
