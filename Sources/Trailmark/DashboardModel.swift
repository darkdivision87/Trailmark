import AppKit
import Combine
import Darwin
import Foundation

final class DashboardModel: ObservableObject {
    @Published var now = Date()
    @Published var cpu: Double = 0
    @Published var memory: Double = 0
    @Published var memoryTotal: Double = Double(ProcessInfo.processInfo.physicalMemory)
    @Published var diskUsed: Double = 0
    @Published var diskTotal: Double = 0
    @Published var upload: Double = 0
    @Published var download: Double = 0
    @Published var address = "Offline"
    @Published var headlines: [Headline] = []
    @Published var feedStatus = "Add an RSS feed in Settings"
    @Published var countdown = Countdown()
    @Published var opacity: Double = UserDefaults.standard.object(forKey: "opacity") as? Double ?? 0.82 {
        didSet { UserDefaults.standard.set(opacity, forKey: "opacity") }
    }
    @Published var feedURL = UserDefaults.standard.string(forKey: "feedURL") ?? ""
    @Published var zones = UserDefaults.standard.string(forKey: "zones") ?? "America/New_York,Europe/Lisbon,Asia/Tokyo,America/Argentina/Buenos_Aires"
    private var timer: AnyCancellable?
    private var previousCPU: (UInt64, UInt64)?
    private var previousNetwork: (UInt64, UInt64, Date)?
    private var ticks = 0
    private var feedTask: URLSessionDataTask?

    init() {
        sample()
        timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect().sink { [weak self] date in
            guard let self else { return }
            self.now = date; self.ticks += 1
            if self.countdown.deadline != nil && self.countdown.seconds(at: date) <= 0 {
                self.countdown.reset(minutes: 25); NSSound.beep()
            }
            if self.ticks % 2 == 0 { self.sample() }
            if self.ticks % 900 == 0 { self.refreshFeed() }
        }
        refreshFeed()
    }
    func saveSettings() {
        UserDefaults.standard.set(feedURL, forKey: "feedURL")
        UserDefaults.standard.set(zones, forKey: "zones")
        refreshFeed()
    }
    private func sample() {
        let host = mach_host_self()
        defer { mach_port_deallocate(mach_task_self_, host) }
        var cpuInfo = host_cpu_load_info_data_t()
        var cpuCount = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info_data_t>.size / MemoryLayout<integer_t>.size)
        let cpuResult = withUnsafeMutablePointer(to: &cpuInfo) { ptr in
            ptr.withMemoryRebound(to: integer_t.self, capacity: Int(cpuCount)) { host_statistics(host, HOST_CPU_LOAD_INFO, $0, &cpuCount) }
        }
        if cpuResult == KERN_SUCCESS {
            let values = cpuInfo.cpu_ticks
            let total = UInt64(values.0) + UInt64(values.1) + UInt64(values.2) + UInt64(values.3)
            let idle = UInt64(values.2)
            if let (lastTotal, lastIdle) = previousCPU, total > lastTotal, idle >= lastIdle {
                cpu = min(1, max(0, 1 - Double(idle - lastIdle) / Double(total - lastTotal)))
            }
            previousCPU = (total, idle)
        }
        var vm = vm_statistics64_data_t()
        var vmCount = mach_msg_type_number_t(MemoryLayout<vm_statistics64_data_t>.size / MemoryLayout<integer_t>.size)
        let vmResult = withUnsafeMutablePointer(to: &vm) { ptr in
            ptr.withMemoryRebound(to: integer_t.self, capacity: Int(vmCount)) { host_statistics64(host, HOST_VM_INFO64, $0, &vmCount) }
        }
        if vmResult == KERN_SUCCESS {
            memory = Double(UInt64(vm.active_count) + UInt64(vm.wire_count) + UInt64(vm.compressor_page_count)) * Double(vm_kernel_page_size)
        }
        if let attrs = try? FileManager.default.attributesOfFileSystem(forPath: NSHomeDirectory()),
           let total = attrs[.systemSize] as? NSNumber, let free = attrs[.systemFreeSize] as? NSNumber {
            diskTotal = total.doubleValue; diskUsed = total.doubleValue - free.doubleValue
        }
        sampleNetwork()
    }
    private func sampleNetwork() {
        var interfaces: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&interfaces) == 0, let first = interfaces else { return }
        defer { freeifaddrs(interfaces) }
        var incoming: UInt64 = 0; var outgoing: UInt64 = 0
        var addresses: [String] = []
        var current: UnsafeMutablePointer<ifaddrs>? = first
        while let pointer = current {
            let item = pointer.pointee
            defer { current = item.ifa_next }
            guard let addr = item.ifa_addr, (item.ifa_flags & UInt32(IFF_UP)) != 0,
                  (item.ifa_flags & UInt32(IFF_LOOPBACK)) == 0 else { continue }
            if addr.pointee.sa_family == UInt8(AF_LINK), let data = item.ifa_data {
                let stats = data.assumingMemoryBound(to: if_data.self).pointee
                incoming += UInt64(stats.ifi_ibytes); outgoing += UInt64(stats.ifi_obytes)
            }
            if addr.pointee.sa_family == UInt8(AF_INET) {
                var buffer = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                if getnameinfo(addr, socklen_t(addr.pointee.sa_len), &buffer, socklen_t(buffer.count), nil, 0, NI_NUMERICHOST) == 0 {
                    addresses.append(String(cString: buffer))
                }
            }
        }
        let date = Date()
        if let (lastIn, lastOut, lastDate) = previousNetwork {
            let elapsed = max(0.01, date.timeIntervalSince(lastDate))
            download = incoming >= lastIn ? Double(incoming - lastIn) / elapsed : 0
            upload = outgoing >= lastOut ? Double(outgoing - lastOut) / elapsed : 0
        }
        previousNetwork = (incoming, outgoing, date)
        address = addresses.first ?? "Offline"
    }
    func refreshFeed() {
        feedTask?.cancel()
        guard !feedURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            headlines = []; feedStatus = "Add an RSS feed in Settings"; return
        }
        guard let url = URL(string: feedURL), url.scheme?.lowercased() == "https", url.host != nil else {
            headlines = []; feedStatus = "Enter a valid HTTPS RSS or Atom URL"; return
        }
        feedStatus = "Loading headlines…"
        let request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 20)
        feedTask = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            if (error as? URLError)?.code == .cancelled { return }
            var items: [Headline] = []
            var status = "Feed unavailable — try again in Settings"
            if error == nil, let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), let data, data.count <= 2_000_000 {
                let reader = FeedReader(); let parser = XMLParser(data: data); parser.delegate = reader
                if parser.parse() { items = Array(reader.items.prefix(5)); status = items.isEmpty ? "No articles found" : "Updated just now" }
            }
            DispatchQueue.main.async { self?.headlines = items; self?.feedStatus = status }
        }
        feedTask?.resume()
    }
    func setVolume(_ value: Double) {
        // Fixed script; no feed text or other external content is interpolated.
        let percent = Int(min(100, max(0, value)))
        NSAppleScript(source: "set volume output volume \(percent)")?.executeAndReturnError(nil)
    }
}

struct Headline: Identifiable { let id = UUID(); let title: String; let url: URL? }
final class FeedReader: NSObject, XMLParserDelegate {
    var items: [Headline] = []
    private var inside = false
    private var element = ""
    private var title = ""
    private var link = ""
    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String] = [:]) {
        element = elementName
        if elementName == "item" || elementName == "entry" { inside = true; title = ""; link = "" }
        if inside && elementName == "link", let href = attributeDict["href"], attributeDict["rel"] == nil || attributeDict["rel"] == "alternate" { link = href }
    }
    func parser(_ parser: XMLParser, foundCharacters string: String) {
        guard inside else { return }
        if element == "title" { title += string }
        if element == "link" { link += string }
    }
    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) { if let text = String(data: CDATABlock, encoding: .utf8) { self.parser(parser, foundCharacters: text) } }
    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        if elementName == "item" || elementName == "entry" {
            let text = title.trimmingCharacters(in: .whitespacesAndNewlines)
            let url = URL(string: link.trimmingCharacters(in: .whitespacesAndNewlines))
            if !text.isEmpty { items.append(Headline(title: text, url: ["https", "http"].contains(url?.scheme?.lowercased() ?? "") ? url : nil)) }
            inside = false
        }
        element = ""
    }
}
