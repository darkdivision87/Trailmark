// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "Trailmark", platforms: [.macOS(.v13)], products: [.executable(name: "Trailmark", targets: ["Trailmark"])], targets: [.executableTarget(name: "Trailmark"), .testTarget(name: "TrailmarkTests", dependencies: ["Trailmark"])])
