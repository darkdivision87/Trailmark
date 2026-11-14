# Build and install Trailmark on macOS

Trailmark 0.7.0 is an Electron app. Build the DMG on a Mac using the source in this repository. macOS packaging and runtime behavior still need testing on a Mac; Windows is the tested platform.

## 1. Install prerequisites

- Install Node.js 20 (with npm) from https://nodejs.org/en/download. This is the project's existing build baseline.
- Install Apple's command line developer tools and complete their installer:

```sh
xcode-select --install
```

- The native window-manager dependency needs Python 3 and a C++ compiler. The compiler comes with the developer tools. Check that Python 3 is installed before proceeding.

```sh
node --version
npm --version
python3 --version
xcode-select -p
uname -m
```

Use an arm64 Node installation on Apple Silicon (`uname -m` shows `arm64`) and x64 Node on Intel (`x86_64`). Build each architecture on its matching Mac; cross-compiling the native module is not covered here.

## 2. Download and run the source

```sh
git clone https://github.com/darkdivision87/Trailmark.git
cd Trailmark
npm ci
npm run rebuild
npm start
```

Alternatively, download Code > Download ZIP on GitHub, extract it, and open Terminal in the extracted folder. Do not copy Windows `node_modules` onto your Mac. `npm ci` installs the locked dependencies; `npm run rebuild` rebuilds the native window-manager module for Electron.

## 3. Build the installer

Quit the development app, then run:

```sh
npm run dist:mac
open dist/0.7.0
```

The command rebuilds the native module and creates a DMG for the host architecture. The installer appears in `dist/0.7.0/`. To explicitly request a matching architecture:

```sh
# Apple Silicon Mac
npm run dist:mac -- --arm64
# Intel Mac
npm run dist:mac -- --x64
```

The build uses no signing credentials. Signing and notarization for public distribution require separate Apple credentials and configuration.

## 4. Install and grant permissions

1. Open the generated DMG and drag Trailmark into Applications.
2. Eject the disk image and open Trailmark from Applications.
3. For your own unsigned build, if macOS blocks opening it, use System Settings > Privacy & Security > Open Anyway after attempting to open the app, then confirm Open. Do this only for a build you trust. Do not disable Gatekeeper globally.
4. For activity tracking, enable Trailmark in System Settings > Privacy & Security > Accessibility. Capturing other apps' window titles may also require Screen Recording permission (the label can vary by macOS version).
5. Quit and reopen Trailmark after changing permissions. When using `npm start`, permissions may apply to Electron instead of the packaged Trailmark app.

Tasks, focus, clipboard, clocks, themes, and mini mode use cross-platform Electron APIs. Per-app system monitoring and native audio-source detection currently support Windows only. The optional browser helper and its installation notes are in `assets/browser-helper/`.

## Troubleshooting and validation

- Native module / ABI errors: run `npm ci` and `npm run rebuild` on the Mac, then retry. Confirm Node and your Mac use the same architecture.
- Build tools / Python errors: finish the developer-tools installation and install Python 3, then retry `npm ci`.
- Empty tracking / missing titles: check the permissions above and restart the app.
- Validate the packaged app by opening it from Applications, switching between apps while tracking, and trying tasks, focus, clipboard recall, and mini mode.
- `npm test` runs unit tests and an Electron smoke test. The smoke test opens windows and exercises native tracking, so it requires a logged-in graphical session and tracking permissions.

User data is stored locally in Electron's user-data directory. Never upload that directory or clipboard history to the repository.
