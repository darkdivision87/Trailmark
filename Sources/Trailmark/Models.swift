import Foundation

enum Module: String, CaseIterable, Codable, Identifiable {
    case clock, calendar, system, disk, network, world, analog, moon, timer, headlines, controls
    var id: String { rawValue }
    var title: String {
        switch self {
        case .clock: return "Clock & Date"
        case .calendar: return "Calendar"
        case .system: return "System"
        case .disk: return "Disk"
        case .network: return "Network"
        case .world: return "World Clocks"
        case .analog: return "Analog Clock"
        case .moon: return "Moon Phase"
        case .timer: return "Focus Timer"
        case .headlines: return "Headlines"
        case .controls: return "Sound & Display"
        }
    }
}

enum Astronomy {
    static func phase(at date: Date) -> Double {
        let epoch = Date(timeIntervalSince1970: 947182440) // 2000-01-06 new moon
        let cycle = date.timeIntervalSince(epoch) / (29.530588853 * 86400)
        return cycle - floor(cycle)
    }
    static func name(_ phase: Double) -> String {
        let names = ["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"]
        return names[Int((phase * 8 + 0.5).rounded(.down)) % 8]
    }
}

struct Countdown {
    var deadline: Date?
    var remaining: TimeInterval = 25 * 60
    mutating func start(at date: Date) { deadline = date.addingTimeInterval(remaining) }
    mutating func pause(at date: Date) { remaining = seconds(at: date); deadline = nil }
    func seconds(at date: Date) -> TimeInterval { max(0, deadline?.timeIntervalSince(date) ?? remaining) }
    mutating func reset(minutes: Int) { deadline = nil; remaining = Double(minutes * 60) }
}
