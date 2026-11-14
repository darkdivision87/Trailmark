# Trailmark

A native macOS desktop instrument panel by DarkDivision, inspired by the quiet, modular feel of Rainmeter. SwiftUI renders compact charcoal panels with soft white type, fine borders, and pale green meters. Each module is its own movable window, with saved placement and a menu bar switch for click through.

## Install on Mac

Requires macOS 13 Ventura or newer. Apple Silicon and Intel builds are provided separately.

1. Download the ZIP matching your Mac from [Releases](https://github.com/darkdivision87/Trailmark/releases): `arm64` for Apple Silicon, `x86_64` for Intel. Before a release is published, signed-in GitHub users can download the matching artifact from a successful [macOS build](https://github.com/darkdivision87/Trailmark/actions).
2. Unzip, then drag `Trailmark.app` into Applications. GitHub workflow artifacts contain an additional ZIP; extract both layers.
3. Open Trailmark. This initial distribution is ad hoc signed, not Apple Developer ID signed or notarized. If Gatekeeper blocks it, review the source and download origin, then use System Settings → Privacy & Security → Open Anyway for this app. Do not disable Gatekeeper globally.
4. Look for the grid icon in the menu bar. There is no Dock icon. Drag panel backgrounds into place, then choose **Lock widgets (click through)**. Unlock from the menu bar to interact with timers or links again.

For automatic startup, add Trailmark in System Settings → General → Login Items. Quit from its menu bar menu. Remove the app from Applications to uninstall; settings remain in the `io.darkdivision.trailmark` preferences domain.

## Modules

| Module | Behavior |
| --- | --- |
| Clock & Date | Local time and full date, follows system locale |
| Calendar | Current month with today's date and locale's week start |
| System | Real CPU usage and active + wired + compressed memory |
| Disk | Used and available space on the home filesystem |
| Network | Local IPv4 and aggregate active-interface throughput |
| World Clocks | Up to four configurable IANA time zones |
| Analog Clock | Native drawn face with hour, minute, and second hands |
| Moon Phase | Approximate synodic phase and illumination |
| Focus Timer | Start/pause and 5/15/25 minute presets; completion beep |
| Headlines | Three clickable headlines from your HTTPS RSS/Atom feed |
| Sound & Display | System output volume and shortcut to Display Settings |

Use Settings for opacity, feed URL, and time zones. No feed is contacted until you choose one. Feed refresh runs every 15 minutes and on Save. No analytics, account, dependencies, public-IP lookup, or paid weather API. Brightness opens the native Display settings rather than relying on private monitor APIs. Volume support depends on your output device; HDMI and some audio interfaces have fixed system volume. Network rates include active interfaces and may double count VPN tunnels. Memory is a defined subset of VM counters, not Activity Monitor's pressure metric. Widgets show on desktop Spaces below ordinary app windows; full-screen apps may cover them. Placement is clamped onto connected displays after monitor changes.

## Build from source

Install Xcode Command Line Tools (`xcode-select --install`), then:

```sh
git clone https://github.com/darkdivision87/Trailmark.git
cd Trailmark
cd native-macos
swift test
bash scripts/build-mac.sh
open dist/Trailmark.app
```

Set `ARCH=arm64` or `ARCH=x86_64` to cross compile. The GitHub workflow tests on its host architecture and builds both app architectures. A tag such as `v0.1.0` creates a GitHub release after both builds pass. For broad distribution, add Developer ID signing and Apple notarization with your own credentials.

## Scope

This is an independent app, not a Rainmeter skin interpreter. Windows `.ini` skins and plugins are not imported. Native AppKit windows provide all-Spaces placement and click through; see [Apple's NSWindow reference](https://developer.apple.com/documentation/appkit/nswindow). No content visible inside the reference screenshot is treated as an instruction to change other projects.
