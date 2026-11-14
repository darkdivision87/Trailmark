import AppKit
import SwiftUI

@main
struct TrailmarkApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate
    var body: some Scene { Settings { EmptyView() } }
}

final class WidgetPanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var status: NSStatusItem!
    private var panels: [Module: WidgetPanel] = [:]
    private var preferences: NSWindow?
    private let model = DashboardModel()
    private var locked = false
    private var hidden = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        status.button?.image = NSImage(systemSymbolName: "square.grid.2x2", accessibilityDescription: "Trailmark")
        rebuildMenu()
        for (index, module) in Module.allCases.enumerated() where enabled(module) { add(module, index: index) }
        NotificationCenter.default.addObserver(self, selector: #selector(recoverScreens), name: NSApplication.didChangeScreenParametersNotification, object: nil)
        if !UserDefaults.standard.bool(forKey: "welcomed") {
            UserDefaults.standard.set(true, forKey: "welcomed")
            showPreferences()
        }
    }
    private func enabled(_ module: Module) -> Bool { UserDefaults.standard.object(forKey: "enabled.\(module.rawValue)") as? Bool ?? true }
    private func add(_ module: Module, index: Int) {
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let width: CGFloat = module == .headlines ? 340 : 238
        let height: CGFloat = module == .calendar ? 246 : (module == .clock ? 154 : 190)
        let frame = NSRect(x: screen.minX + 24 + CGFloat(index % 5) * 260, y: screen.maxY - 24 - height - CGFloat(index / 5) * 270, width: width, height: height)
        let panel = WidgetPanel(contentRect: frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.identifier = NSUserInterfaceItemIdentifier(module.rawValue)
        panel.isReleasedWhenClosed = false
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.isMovableByWindowBackground = true
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
        panel.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopIconWindow)) + 1)
        panel.contentView = NSHostingView(rootView: WidgetView(module: module, model: model))
        panel.setFrameAutosaveName("Trailmark.\(module.rawValue)")
        _ = panel.setFrameUsingName("Trailmark.\(module.rawValue)")
        panel.delegate = self
        panel.ignoresMouseEvents = locked
        panels[module] = panel
        clamp(panel)
        if !hidden { panel.orderFrontRegardless() }
    }
    func windowDidMove(_ notification: Notification) {
        guard let panel = notification.object as? WidgetPanel, let id = panel.identifier?.rawValue else { return }
        panel.saveFrame(usingName: "Trailmark.\(id)")
    }
    private func clamp(_ panel: NSWindow) {
        let screens = NSScreen.screens.map(\.visibleFrame)
        guard !screens.contains(where: { $0.contains(panel.frame) }), let screen = screens.max(by: { a, b in
            a.intersection(panel.frame).width * a.intersection(panel.frame).height < b.intersection(panel.frame).width * b.intersection(panel.frame).height
        }) else { return }
        panel.setFrameOrigin(NSPoint(x: min(max(panel.frame.minX, screen.minX), screen.maxX - panel.frame.width), y: min(max(panel.frame.minY, screen.minY), screen.maxY - panel.frame.height)))
    }
    @objc private func recoverScreens() { panels.values.forEach(clamp) }
    private func rebuildMenu() {
        let menu = NSMenu()
        let title = NSMenuItem(title: "ATMOSPHERE / DARKDIVISION", action: nil, keyEquivalent: "")
        menu.addItem(title)
        menu.addItem(.separator())
        for module in Module.allCases {
            let item = NSMenuItem(title: module.title, action: #selector(toggleModule(_:)), keyEquivalent: "")
            item.representedObject = module.rawValue; item.state = enabled(module) ? .on : .off; item.target = self
            menu.addItem(item)
        }
        menu.addItem(.separator())
        for (title, action) in [(locked ? "Unlock widgets" : "Lock widgets (click through)", #selector(toggleLock)), (hidden ? "Show widgets" : "Hide widgets", #selector(toggleHidden)), ("Settings…", #selector(showPreferences)), ("Reset layout", #selector(resetLayout)), ("Quit Trailmark", #selector(quit))] {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: ""); item.target = self; menu.addItem(item)
        }
        status.menu = menu
    }
    @objc private func toggleModule(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let module = Module(rawValue: raw) else { return }
        let show = !enabled(module); UserDefaults.standard.set(show, forKey: "enabled.\(raw)")
        if show { add(module, index: Module.allCases.firstIndex(of: module) ?? 0) }
        else { panels.removeValue(forKey: module)?.close() }
        rebuildMenu()
    }
    @objc private func toggleLock() { locked.toggle(); panels.values.forEach { $0.ignoresMouseEvents = locked }; rebuildMenu() }
    @objc private func toggleHidden() { hidden.toggle(); panels.values.forEach { hidden ? $0.orderOut(nil) : $0.orderFrontRegardless() }; rebuildMenu() }
    @objc private func resetLayout() {
        for module in Module.allCases { UserDefaults.standard.removeObject(forKey: "NSWindow Frame Trailmark.\(module.rawValue)") }
        panels.values.forEach { $0.close() }; panels.removeAll()
        for (index, module) in Module.allCases.enumerated() where enabled(module) { add(module, index: index) }
    }
    @objc private func showPreferences() {
        if preferences == nil {
            let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 480, height: 450), styleMask: [.titled, .closable], backing: .buffered, defer: false)
            window.title = "Trailmark Settings"; window.isReleasedWhenClosed = false
            window.contentView = NSHostingView(rootView: PreferencesView(model: model)); window.center(); preferences = window
        }
        NSApp.activate(ignoringOtherApps: true); preferences?.makeKeyAndOrderFront(nil)
    }
    @objc private func quit() { NSApp.terminate(nil) }
}
