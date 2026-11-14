const { ipcMain, BrowserWindow, dialog, nativeTheme } = require('electron');
const fs = require('fs').promises;
const tracker = require('./tracker');
const store = require('./store-instance');
const preferences = require('./preferences');
const focus = require('./focus');
const clipboardHistory=require('./clipboard');
const media=require('./media');
const systemMonitor=require('./system-monitor');
const news=require('./news');
const launcher=require('./launcher');
function init(shortcuts,windows={}) {
  ipcMain.handle('get-state', async () => ({launchers:await launcher.list(await store.getEntries()),entries: await store.getEntries(), tracking: tracker.getTrackingState(), ...await preferences.get(), focus: focus.state(), shortcutStatus: shortcuts.status(),clipboardStatus:clipboardHistory.status(),system:systemMonitor.state()}));
  const safe = callback => async (_event, ...args) => {
    try { const data = await callback(...args); tracker.notify(); return {success:true, data}; }
    catch (error) { return {success:false,error:error.message}; }
  };
  ipcMain.handle('launcher-add',safe(()=>launcher.add()));
  ipcMain.handle('launcher-open',safe(id=>launcher.open(id)));
  ipcMain.handle('launcher-remove',safe(id=>launcher.remove(id)));
  ipcMain.handle('get-news',()=>news.get());
  ipcMain.handle('refresh-news',safe(()=>news.get(true)));
  ipcMain.handle('open-headline',safe(url=>news.open(url)));
  ipcMain.handle('end-app',safe((id,processes)=>systemMonitor.endApp(id,processes)));
  ipcMain.handle('start-task',safe(id=>preferences.startTask(id)));
  ipcMain.handle('get-media',()=>media.state());
  ipcMain.handle('start-media',safe(()=>media.start()));
  ipcMain.handle('stop-media',safe(()=>media.stop()));
  ipcMain.handle('pair-media',safe(()=>media.pair()));
  ipcMain.handle('copy-media-pair',safe(async()=>{const text=JSON.stringify(await media.pair());clipboardHistory.ignoreText(text);require('electron').clipboard.writeText(text);return true;}));
  ipcMain.handle('open-media-helper',safe(()=>media.openHelper()));
  ipcMain.handle('media-tab-action',safe((browser,id,action,clientId)=>media.tabAction(browser,id,action,clientId)));
  ipcMain.handle('open-volume-mixer',safe(()=>require('electron').shell.openExternal('ms-settings:apps-volume')));
  ipcMain.handle('get-clipboard',()=>clipboardHistory.get());
  ipcMain.handle('clipboard-image',safe(id=>clipboardHistory.image(id)));
  ipcMain.handle('clipboard-save-current',safe(()=>clipboardHistory.saveCurrent()));
  ipcMain.handle('clipboard-copy',safe(id=>clipboardHistory.copy(id)));
  ipcMain.handle('clipboard-pin',safe((id,pinned)=>clipboardHistory.pin(id,pinned)));
  ipcMain.handle('clipboard-delete',safe(id=>clipboardHistory.remove(id)));
  ipcMain.handle('clipboard-clear-recent',safe(()=>clipboardHistory.clearRecent()));
  ipcMain.handle('clipboard-delete-all',safe(()=>clipboardHistory.deleteAll()));
  ipcMain.handle('start-tracking', safe(() => tracker.startTracking()));
  ipcMain.handle('stop-tracking', safe(() => tracker.stopTracking()));
  ipcMain.handle('get-tracker-state', () => tracker.getTrackingState());
  ipcMain.handle('clear-data', safe(() => tracker.clearData()));
  ipcMain.handle('save-settings', safe(async settings => {
    const previous = {...preferences.settings};
    const saved = await shortcuts.saveSettings(settings);
    if (settings.theme !== undefined) nativeTheme.themeSource = saved.settings.theme;
    if(previous.clipboardEnabled!==saved.settings.clipboardEnabled||previous.clipboardDays!==saved.settings.clipboardDays)await clipboardHistory.configure();
    if(previous.systemEnabled!==saved.settings.systemEnabled||settings.systemEnabled===true&&!systemMonitor.state().running){if(saved.settings.systemEnabled)await systemMonitor.start();else systemMonitor.stop();}
    if(['newsEnabled','newsScope','newsCountry','newsLocal'].some(key=>previous[key]!==saved.settings[key]))news.configure();
    const captureKeys = ['idleMinutes','pollSeconds','trackTitles','trackPaths','excludedApps'];
    if (captureKeys.some(key => previous[key] !== saved.settings[key])) await tracker.reconfigure();
    return saved;
  }));
  ipcMain.handle('save-project', safe(project => preferences.saveProject(project)));
  ipcMain.handle('save-task',safe(task=>preferences.saveTask(task)));
  ipcMain.handle('time-task',safe((id,running)=>preferences.timeTask(id,!!running)));
  ipcMain.handle('move-task',safe((id,target,position)=>preferences.moveTask(id,target,position)));
  ipcMain.handle('open-task-link',safe(async id=>{const task=(await preferences.get()).tasks.find(t=>t.id===id);if(!task?.link)throw new Error('Attach a link first.');const url=new URL(task.link);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Invalid task link.');await require('electron').shell.openExternal(url.href);return true;}));
  ipcMain.handle('complete-task',safe((id,complete)=>preferences.completeTask(id,complete)));
  ipcMain.handle('delete-task',safe(id=>preferences.deleteTask(id)));
  ipcMain.handle('open-mini',safe(()=>windows.openMini?.()));
  ipcMain.handle('show-main',safe(()=>windows.showMain?.()));
  ipcMain.handle('pin-mini',safe(()=>windows.pinMini?.()));
  ipcMain.handle('delete-project', safe(id => preferences.deleteProject(id)));
  ipcMain.handle('assign-project', safe((id, projectId) => store.assignProject(id, projectId)));
  ipcMain.handle('start-focus', safe(async(minutes,taskId) => {if(![25,50].includes(Number(minutes)))throw new Error('Choose a 25 or 50 minute session.');if(taskId)await preferences.startTask(taskId);return focus.start(minutes,taskId);}));
  ipcMain.handle('stop-focus', safe(() => focus.stop()));
  ipcMain.handle('get-entries-by-range', safe((start, end) => store.getEntriesByTimeRange(start,end)));
  ipcMain.handle('get-summary', safe(() => store.getSummary()));
  ipcMain.handle('export-data', async (event, format, ids, range) => {
    try {
      if (!['csv','json'].includes(format)) throw new Error('Unsupported export format');
      const entries = await store.getEntries();
      let chosen = Array.isArray(ids) ? entries.filter(e => ids.includes(e.id)) : entries;
      const model = require('../renderer/data');
      if (Array.isArray(range) && range.length === 2 && range.every(Number.isFinite)) chosen = model.clip(chosen,range[0],range[1]);
      const result = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
        title:'Export activity', defaultPath:'Trailmark-activity.'+format,
        filters:[{name:format.toUpperCase(),extensions:[format]}]
      });
      if (result.canceled) return {success:true,canceled:true};
      let content;
      if (format === 'json') {const saved=await preferences.get();content = JSON.stringify({version:2, exportedAt:new Date().toISOString(), entries:chosen, projects:saved.projects,tasks:saved.tasks},null,2);}
      else {
        const cell = value => '"'+String(value ?? '').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
        const projects = (await preferences.get()).projects;
        content = ['Started,Application,Window title,Duration (seconds),Project', ...chosen.map(e => [new Date(e.timestamp).toISOString(),e.window?.appName || e.window?.path?.split(/[\\/]/).pop() || 'Application',e.window?.title,Math.round(e.duration),model.projectFor(e,projects)?.name || ''].map(cell).join(','))].join('\r\n');
      }
      await fs.writeFile(result.filePath, content, 'utf8');
      return {success:true,count:chosen.length};
    } catch (error) { return {success:false,error:error.message}; }
  });
  for (const action of ['minimize','maximize','close']) ipcMain.on(action, event => {
    const win = BrowserWindow.fromWebContents(event.sender); if (!win) return;
    if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize(); else win[action]();
  });
}
module.exports = {init};
