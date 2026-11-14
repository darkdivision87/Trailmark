// Main process for Trailmark
const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeTheme, screen } = require('electron');
const path = require('path');
const tracker = require('./tracker');
const preferences = require('./preferences');
let quitting = false;

let mainWindow;
let tray;
let miniWindow;
function openMini(){
  if(!miniWindow||miniWindow.isDestroyed()){
    const area=screen.getDisplayMatching(mainWindow?.getBounds()||screen.getPrimaryDisplay().workArea).workArea;
    const width=Math.min(360,area.width),height=Math.min(740,area.height-32);
    miniWindow=new BrowserWindow({width,height,x:area.x+area.width-width-16,y:area.y+16,minWidth:320,minHeight:460,resizable:true,alwaysOnTop:false,frame:false,show:false,backgroundColor:'#202126',icon:path.join(__dirname,'../assets/trailmark.ico'),webPreferences:{preload:path.join(__dirname,'../preload/preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true}});
    miniWindow.loadFile(path.join(__dirname,'../renderer/mini.html'));
    miniWindow.once('ready-to-show',()=>miniWindow?.show());
    miniWindow.on('closed',()=>{miniWindow=null;});
  }else{miniWindow.show();miniWindow.focus();}
  mainWindow?.hide();
}
function pinMini(){if(!miniWindow)return false;const pinned=!miniWindow.isAlwaysOnTop();miniWindow.setAlwaysOnTop(pinned);return pinned;}

/**
 * Create the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    icon: path.join(__dirname, '../assets/trailmark.ico'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#191a1e' : '#fafbf9',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  // Load the renderer
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', event => {
    if (!quitting && preferences.settings.closeToTray && tray) { event.preventDefault(); mainWindow.hide(); }
  });
  // Handle window closing
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize IPC handlers - moved here to prevent duplicate registration
const ipcHandlers = require('./ipc');
const shortcuts = require('./shortcuts').createManager({globalShortcut,preferences,actions:{
  toggleTracking: () => (tracker.getTrackingState().isTracking ? tracker.stopTracking() : tracker.startTracking()).catch(console.error),
  showWindow
}});
ipcHandlers.init(shortcuts,{openMini,showMain:()=>{showWindow();miniWindow?.hide();},pinMini});

/**
 * Create system tray icon and menu
 */
function createTray() {
  const iconPath = path.join(__dirname, '../assets/trailmark-icon.png');
  
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Trailmark', click: showWindow },
    { label: 'Mini mode', click: openMini },
    { type: 'separator' },
    { label: 'Start Tracking', click: () => tracker.startTracking().catch(console.error) },
    { label: 'Stop Tracking', click: () => tracker.stopTracking().catch(console.error) },
    { label: 'Start tracking on launch', type:'checkbox',checked:preferences.settings.autoStart,click:async item=>{try{await preferences.saveSettings({autoStart:item.checked});tracker.notify();}catch(error){console.error(error);item.checked=preferences.settings.autoStart;}} },
    { type: 'separator' },
    { label: 'Quit', role: 'quit' }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('Trailmark · your time and tasks');
  tray.on('right-click',()=>{const item=contextMenu.items.find(item=>item.label==='Start tracking on launch');if(item)item.checked=preferences.settings.autoStart;});
  
  // Double-click to show window
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
  });
}

/**
 * Register global shortcuts
 */
function registerShortcuts() { return shortcuts.start(); }

/**
 * Unregister all shortcuts
 */
function unregisterShortcuts() {
  shortcuts.stop();
}

// Electron app lifecycle events
app.on('ready', async () => {
  await preferences.ready;
  nativeTheme.themeSource = preferences.settings.theme;
  createWindow();
  try { createTray(); } catch (error) { console.error('Tray unavailable:', error); }
  Menu.setApplicationMenu(null);
  await registerShortcuts();
  await require('./clipboard').configure().catch(console.error);
  await require('./media').initialize();
  if(preferences.settings.systemEnabled)await require('./system-monitor').start();
  require('./news').configure();
  if (preferences.settings.autoStart) tracker.startTracking().catch(console.error);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Handle app quitting
app.on('before-quit', () => {
  quitting = true;
  require('./focus').stop();
  require('./clipboard').stop();
  require('./media').shutdown();
  require('./system-monitor').stop();
  require('./news').stop();
  unregisterShortcuts();
});

let finishing = false;
app.on('before-quit', event => {
  if (finishing) return;
  event.preventDefault();
  Promise.all([tracker.stopTracking(),require('./clipboard').flush()]).catch(console.error).finally(() => { finishing = true; app.quit(); });
});
function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
// Export functions for testing/other modules
module.exports = {
  createWindow,
  createTray,
  registerShortcuts,
  unregisterShortcuts
};
