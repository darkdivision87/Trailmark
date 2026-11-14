# Trailmark

A desktop workspace for tasks, focus sessions, activity tracking, clipboard recall, world clocks, and system monitoring. Built with Electron for Windows, with macOS packaging available for testing.

## Development

Use Node.js 20 and the native build tools for your operating system.

```sh
npm ci
npm run rebuild
npm start
```

Run `npm test` to run the unit tests and Electron smoke test. Windows builds use `npm run dist`. For Mac DMG builds, follow [MAC-BUILD.md](MAC-BUILD.md).

## Platform support

Windows is the tested platform for version 0.7.0. The Mac package remains untested. Native system monitoring and application audio detection currently require Windows. macOS activity tracking requires Accessibility permissions and a native Electron module rebuild on the Mac.

Clipboard capture, tracking on launch, global hotkeys, and the news feed are optional. User data is stored locally; do not commit your Electron user-data directory or clipboard history.
