const { BrowserWindow, powerMonitor } = require('electron');
const { randomUUID } = require('crypto');
const store = require('./store-instance');
const preferences = require('./preferences');
let manager, isTracking = false, activeWindow = null, lastEntry = null, timer = null, lastPoll = 0, idle = false, errorMessage = null;
let pending = Promise.resolve();
function notify() { for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('update'); }
function allowance() { return Math.max(5000, preferences.settings.pollSeconds * 1500); }
async function accrue(now, idleSeconds = 0) {
  if (!lastEntry) return;
  const elapsed = now - lastPoll;
  let delta = elapsed > allowance() ? 0 : Math.max(0, elapsed);
  const idleLimit = preferences.settings.idleMinutes * 60;
  if (idleSeconds >= idleLimit) {
    // Exclude the entire idle period, including the threshold grace period.
    lastEntry.duration = Math.max(0, lastEntry.duration - Math.max(0, idleSeconds - delta / 1000));
    delta = 0;
  }
  lastEntry.duration += delta / 1000;
  await store.addEntry(lastEntry);
}
function pollActiveWindow() {
  pending = pending.then(async () => {
    if (!isTracking) return;
    const now = Date.now();
    const idleSeconds = powerMonitor.getSystemIdleTime();
    await accrue(now, idleSeconds);
    lastPoll = now;
    idle = idleSeconds >= preferences.settings.idleMinutes * 60;
    if (idle) { activeWindow = null; lastEntry = null; notify(); return; }
    const win = manager.getActiveWindow();
    if (!win?.id) { activeWindow = null; lastEntry = null; notify(); return; }
    const title = win.getTitle() || '';
    const appName = (win.path || '').split(/[\\/]/).pop()?.replace(/\.exe$/i, '') || 'Application';
    const excluded = preferences.settings.excludedApps.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    if (excluded.some(x => appName.toLowerCase().includes(x))) { activeWindow = null; lastEntry = null; notify(); return; }
    const capturedTitle = preferences.settings.trackTitles ? title : appName;
    const appKey = appName.toLowerCase();
    if (!activeWindow || activeWindow.id !== win.id || activeWindow.title !== capturedTitle) {
      activeWindow = { id: win.id, title: capturedTitle, processId: win.processId, appName, appKey, path: preferences.settings.trackPaths ? (win.path || '') : '' };
      lastEntry = { id: randomUUID(), timestamp: now, duration: 0, window: activeWindow, apps: [appName] };
      await store.addEntry(lastEntry);
    }
    notify();
  }).catch(error => {
    errorMessage = error.message;
    console.error('Tracking failed:', error);
    isTracking = false; clearInterval(timer); timer = null; activeWindow = null; lastEntry = null; notify();
  });
  return pending;
}
async function startTracking() {
  await preferences.ready;
  if (isTracking) return;
  errorMessage = null;
  manager = require('node-window-manager').windowManager;
  isTracking = true; idle = false; lastPoll = Date.now();
  await pollActiveWindow();
  if (!isTracking) throw new Error(errorMessage || 'Unable to read the active window.');
  timer = setInterval(pollActiveWindow, preferences.settings.pollSeconds * 1000);
}
async function stopTracking() {
  clearInterval(timer); timer = null;
  await pending;
  if (isTracking) await accrue(Date.now(), powerMonitor.getSystemIdleTime());
  isTracking = false; idle = false; activeWindow = null; lastEntry = null;
  notify();
}
async function clearData() {
  const resume = isTracking;
  await stopTracking(); await store.clear();
  if (resume) await startTracking();
  notify();
}
async function reconfigure() {
  if (isTracking) { await stopTracking(); await startTracking(); }
  notify();
}
function getTrackingState() { return { isTracking, idle, activeWindow, lastEntry, error: errorMessage }; }
module.exports = { startTracking, stopTracking, pollActiveWindow, getTrackingState, clearData, reconfigure, notify };
