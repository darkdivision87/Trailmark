# Trailmark browser helper — Chrome and Edge

1. In Chrome open chrome://extensions; in Edge open edge://extensions.
2. Enable Developer mode, select Load unpacked, and choose this folder.
3. Open Trailmark → What's playing? → Copy pairing code.
4. Open the extension popup, paste the code, and select Connect browser.
5. Start the monitor in Trailmark. Audible tabs appear with Find tab and Mute controls.

Pairing persists across app restarts unless its local port becomes unavailable. Use Report now in the helper popup for an immediate connection; idle heartbeat reconnection may take about 30 seconds. While the monitor runs, tab updates are checked every two seconds, and browser events refresh audible/mute/title changes immediately.

The helper reads audible tab titles and URLs through the tabs permission, and sends them only to authenticated Trailmark on 127.0.0.1. It does not record audio, read page contents, or send data to a cloud service. Silent videos are not reported. Disconnect in the popup to stop sharing. Removing the extension also stops sharing.
