const {app,BrowserWindow,dialog,nativeTheme,globalShortcut,clipboard,safeStorage}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
app.setName('Trailmark Design Test');
const profile=path.join(__dirname,'../.test-data-'+process.pid);
app.setPath('userData',profile);
const base=process.env.TRAILMARK_TEST_PACKAGE || path.join(__dirname,'..');
const errors=[];
app.on('browser-window-created',(_e,win)=>win.webContents.on('console-message',(_event,level,message)=>{if(level===3&&!message.includes('Security Warning'))errors.push(message);}));
require(path.join(base,'main/main'));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function captureWindow(window){for(let attempt=0;attempt<3;attempt++){try{return await window.webContents.capturePage();}catch(error){if(attempt===2)throw error;window.show();window.focus();await wait(300);}}}
function cleanupTools(){try{require(path.join(base,'main/media')).shutdown();require(path.join(base,'main/clipboard')).stop();require(path.join(base,'main/system-monitor')).stop();require(path.join(base,'main/news')).stop();}catch(_){}}
const timeout=setTimeout(()=>{console.error('TEST TIMEOUT');cleanupTools();app.exit(1);},120000);
app.whenReady().then(async()=>{
 await wait(1300);
 const win=BrowserWindow.getAllWindows()[0];assert(win);
 const run=async code=>{try{return await win.webContents.executeJavaScript(code);}catch(error){console.error('FAILED RENDERER ACTION:',code);console.error('Renderer errors:',errors);throw error;}};
 async function until(code){for(let i=0;i<50;i++){if(await run(code))return;await wait(100);}throw new Error('Condition not reached: '+code);}
 const tracker=require(path.join(base,'main/tracker'));
 const store=require(path.join(base,'main/store-instance'));
 const prefs=require(path.join(base,'main/preferences'));
 await prefs.saveSettings({idleMinutes:60});
 assert.equal(await run('document.querySelectorAll("nav .nav-item").length'),10);
 assert.equal(await run('document.getElementById("page-title").textContent'),'Today');
 await fs.mkdir(path.join(__dirname,'../artifacts'),{recursive:true});
 await wait(250);await run('document.getElementById("toast").className=""');await run('document.getElementById("toast").className=""');await wait(250);await fs.writeFile(path.join(__dirname,'../artifacts/trailmark-empty.png'),(await captureWindow(win)).toPNG());
 // Exercise the actual native window manager without using the user's activity profile.
 await tracker.startTracking();assert(tracker.getTrackingState().isTracking);await wait(2200);await tracker.stopTracking();
 let entries=await store.getEntries();assert(entries.length>0);assert(entries.some(e=>e.duration>0));
 await tracker.clearData();
 const D=require(path.join(base,'renderer/data'));
 const [start]=D.bounds(D.dateKey(Date.now()));
 const specs=[['Figma','Website / visual system',8.5,4100],['code','Trailmark / dashboard.js',9.8,5400],['chrome','Research / interaction patterns',11.4,1800],['code','Trailmark / project rules',12.5,4500],['Figma','Client review / design polish',14.2,3600],['slack','Team / feedback',15.3,1000],['code','Trailmark / release checks',16,3300]];
 await Promise.all(specs.map(([appName,title,hour,duration],i)=>store.addEntry({id:'fixture-'+i,timestamp:start+hour*3600000,duration,window:{appName,appKey:appName,title,path:''}})));
 const malicious={id:'escaped',timestamp:start+17.5*3600000,duration:60,window:{appName:'Test',appKey:'test',title:'<img src=x onerror="window.injectionRan=true">'}};
 await store.addEntry(malicious);
 await run('refresh()');
 // Shortcuts stay off until explicitly configured, including former hardcoded app shortcuts.
 assert.equal((await prefs.get()).settings.shortcuts.enabled,false);
 assert.equal(globalShortcut.isRegistered('Control+Shift+T'),false);
 await run('document.dispatchEvent(new KeyboardEvent("keydown",{key:"k",code:"KeyK",ctrlKey:true,bubbles:true}))');assert.equal(await run('currentView'),'today');
 // Create project using the actual dialog and submit handler.
 await run('navigateToView("projects")');
 await run('document.querySelector("[data-action=new-project]").click()');
 assert(await run('document.getElementById("modal").open'));
 await run('document.querySelector("#project-form [name=name]").value="Trailmark";document.querySelector("#project-form [name=keywords]").value="Trailmark";document.getElementById("project-form").requestSubmit()');
 await until('state.projects.length===1 && !document.getElementById("modal").open');
 const project=(await prefs.get()).projects[0];assert.equal(project.name,'Trailmark');
 assert(await run('document.querySelector(".project-card").textContent.includes("Trailmark")'));
 await run('document.getElementById("toast").className=""');await wait(250);await fs.writeFile(path.join(__dirname,'../artifacts/trailmark-projects.png'),(await captureWindow(win)).toPNG());
 await run('navigateToView("timeline")');assert.equal(await run('document.querySelector("nav .nav-item.active").dataset.nav'),'timeline');
 await run('document.getElementById("activity-search").value="release";document.getElementById("activity-search").dispatchEvent(new Event("input",{bubbles:true}))');
 assert.equal(await run('document.querySelectorAll("#timeline-list [data-entry]").length'),1);
 await run('document.querySelector("[data-entry=fixture-6]").click()');
 assert(await run('document.getElementById("session-detail").textContent.includes("release checks")'));
 await run('document.getElementById("assign-project").value="";document.getElementById("assign-project").dispatchEvent(new Event("change",{bubbles:true}))');
 await until('state.entries.find(e=>e.id==="fixture-6").projectId===""');
 await run('document.getElementById("assign-project").value="__auto__";document.getElementById("assign-project").dispatchEvent(new Event("change",{bubbles:true}))');
 await until('state.entries.find(e=>e.id==="fixture-6").projectId==null');
 await run('document.querySelector("[data-action=reset-filters]").click()');
 assert.equal(await run('!!window.injectionRan'),false);
 assert.equal(await run('document.querySelectorAll("#timeline-list img").length'),0);
 // Export is tested through the secure renderer API; only the test save dialog is substituted.
 const oldDialog=dialog.showSaveDialog;
 const csv=path.join(profile,'activity.csv');dialog.showSaveDialog=async()=>({filePath:csv,canceled:false});
 const exported=await run('window.trailmark.exportData("csv",["fixture-6"])');assert(exported.success);assert.equal(exported.count,1);
 assert((await fs.readFile(csv,'utf8')).includes('Trailmark'));
 const json=path.join(profile,'activity.json');dialog.showSaveDialog=async()=>({filePath:json,canceled:false});
 assert((await run('window.trailmark.exportData("json")')).success);
 assert.equal(JSON.parse(await fs.readFile(json,'utf8')).entries.length,8);
 dialog.showSaveDialog=oldDialog;
 await store.addEntry({...malicious,duration:0});await run('refresh()');
 await run('navigateToView("today")');await wait(150);
 await run('document.getElementById("toast").className=""');await wait(250);await fs.writeFile(path.join(__dirname,'../artifacts/trailmark-today.png'),(await captureWindow(win)).toPNG());
 await run('document.querySelector("[data-action=focus]").click()');await until('state.focus && state.focus.minutes===25');
 await run('navigateToView("insights")');await run('navigateToView("today")');assert(await run('state.focus.endsAt>Date.now()'));
 await run('document.querySelector("[data-action=focus]").click()');await until('state.focus===null');
 await run('navigateToView("settings")');await run('document.getElementById("toast").className=""');await wait(250);await fs.writeFile(path.join(__dirname,'../artifacts/trailmark-settings.png'),(await captureWindow(win)).toPNG());
 await run('document.querySelector("#settings-form [name=theme]").value="dark";document.querySelector("#settings-form [name=theme]").dispatchEvent(new Event("change",{bubbles:true}))');
 await wait(150);assert.equal(await run('document.documentElement.dataset.theme'),'dark','Changing appearance must apply immediately without submitting the form');
 await until('state.settings.theme==="dark"');
 assert.equal(nativeTheme.themeSource,'dark');
 let appearanceRestarts=0;
 const originalReconfigure=tracker.reconfigure;
 tracker.reconfigure=async()=>{appearanceRestarts++;return originalReconfigure();};
 await run('for(const theme of ["light","system","dark"]){const select=document.querySelector("#settings-form [name=theme]");select.value=theme;select.dispatchEvent(new Event("change",{bubbles:true}));}');
 await until('appearanceOverride===null && state.settings.theme==="dark"');
 assert.equal(appearanceRestarts,0,'Changing appearance must not restart tracking');
 tracker.reconfigure=originalReconfigure;
 win.webContents.reload();await wait(600);
 await until('document.documentElement.dataset.theme==="dark" && !!document.getElementById("tracking-toggle")');
 await run('navigateToView("settings")');
 await run('document.querySelector("#settings-form [name=dailyGoalHours]").value="7";document.getElementById("settings-form").requestSubmit()');
 await until('document.documentElement.dataset.theme==="dark" && state.settings.dailyGoalHours===7');
 const disk=JSON.parse(await fs.readFile(path.join(profile,'trailmark-preferences.json'),'utf8'));assert.equal(disk.settings.theme,'dark');assert.equal(disk.projects.length,1);
 await run('navigateToView("today")');await wait(100);
 await run('document.getElementById("toast").className=""');await wait(250);await fs.writeFile(path.join(__dirname,'../artifacts/trailmark-dark.png'),(await captureWindow(win)).toPNG());

 // Task capture, project types, one priority, completion / Undo and linked focus.
 await run('navigateToView("tasks")');
 await run('document.querySelector("#task-capture [name=title]").value="Finish the Trailmark release";document.querySelector("#task-capture [name=projectId]").value='+JSON.stringify(project.id)+';document.getElementById("task-capture").requestSubmit()');
 await until('state.tasks.length===1 && document.querySelectorAll("[data-task-row]").length===1');
 const first=(await prefs.get()).tasks[0];assert.equal(first.projectId,project.id);
 await run('document.querySelector("[data-action=edit-task]").click();document.querySelector("[data-action=one-thing]").click()');await until('state.tasks[0].oneThing && !document.getElementById("modal").open');
 await run('document.querySelector("#one-thing [data-action=task-focus]").click()');await until('state.focus && state.focus.taskId===state.tasks[0].id');
 assert.equal(await run('document.querySelectorAll("#task-list [data-task-row]").length'),1);
 await run('window.trailmark.stopFocus()');await run('refresh()');

 await run('document.querySelector("[data-action=complete-task]").click()');await until('state.tasks[0].completedAt && document.getElementById("toast").textContent.includes("Undo")');assert.equal(await run('getComputedStyle(document.getElementById("toast")).pointerEvents'),'auto');
 await run('document.querySelector("[data-action=undo-task]").click()');await until('!state.tasks[0].completedAt');
 await run('document.querySelector("[data-action=task-today]").click()');await until('!state.tasks[0].today');
 await run('document.querySelector("#task-capture [name=title]").value="Plan tomorrow in three lines";document.getElementById("task-capture").requestSubmit()');await until('state.tasks.length===2');
 await run('document.getElementById("task-type").value="Work";document.getElementById("task-type").dispatchEvent(new Event("change",{bubbles:true}))');assert.equal(await run('document.querySelectorAll("[data-task-row]").length'),1);
 await prefs.saveTask({id:first.id,oneThing:true,today:true});await run('taskType="";refresh()');await run('navigateToView("tasks")');
 await run('document.getElementById("toast").className=""');await wait(900);await fs.writeFile(path.join(__dirname,'../artifacts/trailmark-tasks.png'),(await captureWindow(win)).toPNG());
 // Five skins and five accents apply and persist. User-assigned shortcut recording is opt in.
 await run('navigateToView("settings")');assert.equal(await run('document.querySelectorAll(".skin-choice").length'),5);assert.equal(await run('document.querySelectorAll(".accent-choice").length'),7);
 await run('document.querySelector("[data-action=skin][data-value=midnight]").click()');await until('state.settings.skin==="midnight"');
 await run('document.querySelector("[data-action=accent][data-value=blue]").click()');await until('state.settings.accent==="blue"');assert.equal(await run('document.documentElement.dataset.skin'),'midnight');
 await run('document.querySelector("#shortcut-master").click();document.querySelector("[data-accelerator=tasks]").click();document.querySelector("[data-accelerator=tasks]").dispatchEvent(new KeyboardEvent("keydown",{key:"j",code:"KeyJ",ctrlKey:true,altKey:true,bubbles:true}));document.querySelector("[name=shortcut-tasks]").checked=true;document.getElementById("settings-form").requestSubmit()');await until('state.settings.shortcuts.enabled');
 await run('document.activeElement.blur();document.dispatchEvent(new KeyboardEvent("keydown",{key:"j",code:"KeyJ",ctrlKey:true,altKey:true,bubbles:true}))');assert.equal(await run('currentView'),'tasks');
 await run('window.trailmark.saveSettings({shortcuts:Keys.empty(),skin:"graphite",accent:"green"})');await run('refresh()');
 // The desktop companion starts small, shows live shared tasks and records task edits across windows.
 await prefs.saveTask({title:'Draft the client update',type:'Work'});await prefs.saveTask({title:'Read ten pages',type:'Learning'});await prefs.saveTask({title:'Take a short walk',type:'Personal'});await run('refresh()');
 await run('window.trailmark.openMini()');await wait(700);
 const mini=BrowserWindow.getAllWindows().find(w=>w!==win);assert(mini);assert.equal(mini.getSize()[0],360);assert.equal(mini.isAlwaysOnTop(),false);assert.equal(win.isVisible(),false);
 const miniRun=async code=>{try{return await mini.webContents.executeJavaScript(code);}catch(error){console.error("FAILED MINI ACTION:",code);console.error("Renderer errors:",errors);throw error;}};
 assert.equal(await miniRun('document.querySelectorAll(".mini-task").length'),5);
 await miniRun('document.querySelector("[data-complete]").click()');await wait(250);assert.equal((await prefs.get()).tasks.filter(t=>t.completedAt).length,1);await run('refresh()');assert.equal(await run('document.querySelectorAll("#task-list [data-task-row]").length'),4);
 await miniRun('document.querySelector("[data-undo]").click()');await wait(250);assert.equal((await prefs.get()).tasks.filter(t=>t.completedAt).length,0);
 await miniRun('document.querySelector("#mini-capture [name=title]").value="Send the finished draft";document.getElementById("mini-capture").requestSubmit()');await wait(250);assert.equal((await prefs.get()).tasks.length,6);
 assert.equal(await miniRun('document.querySelectorAll(".mini-task").length'),6);
 await miniRun('document.querySelector("[data-mini-tab=tasks]").click()');assert(await miniRun('!document.querySelector("[data-mini-panel=tasks]").hidden && document.querySelector("[data-mini-panel=activity]").hidden'));
 await miniRun('document.querySelector("[data-mini-tab=clipboard]").click()');await wait(200);assert(await miniRun('!document.querySelector("[data-mini-panel=clipboard]").hidden'));assert(await miniRun('!!document.getElementById("mini-clip-search")'));
 await miniRun('document.querySelector("[data-mini-tab=focus]").click()');
 await miniRun('state.system={running:true,sampledAt:Date.now(),cpu:12,totalRam:16000000000,freeRam:8000000000,apps:[{id:"preview",name:"Editor",cpu:10,ram:500000000,canEnd:false,processes:[]}]};renderMiniResources()');
 assert(await miniRun('document.getElementById("mini-resources").textContent.includes("CPU")'));await miniRun('document.querySelector("#mini-resources details").open=true');assert(await miniRun('document.querySelectorAll("[data-end-app]").length>0'));await miniRun('document.querySelector("#mini-resources details").open=false');
 await miniRun('document.getElementById("focus").click()');await wait(150);await run('refresh()');assert(await run('state.focus && state.focus.minutes===25'));
 assert.equal(await miniRun('document.querySelectorAll(".mini-app").length'),5);assert.equal(await miniRun('document.querySelectorAll(".mini-rhythm i").length'),24);
 assert(await miniRun('document.body.scrollWidth<=document.body.clientWidth'));
 await miniRun('document.getElementById("toast").className=""');await wait(250);assert(await miniRun('document.querySelector(".mini-main").scrollHeight>=document.querySelector(".mini-main").clientHeight')); await fs.writeFile(path.join(__dirname,'../artifacts/trailmark-mini.png'),(await captureWindow(mini)).toPNG());
 await miniRun('document.getElementById("tracking").click()');await wait(2400);assert(await miniRun('state.tracking.isTracking && document.getElementById("live-state").textContent.includes("Live")'));assert(await run('state.tracking.isTracking'));await miniRun('document.getElementById("tracking").click()');await wait(100);
 mini.setSize(320,480);await wait(100);assert(await miniRun('document.body.scrollWidth<=document.body.clientWidth'));mini.setSize(360,740);
 await miniRun('document.getElementById("expand").click()');await wait(100);assert(win.isVisible());assert(!mini.isVisible());
 await run('window.trailmark.stopFocus()');await run('refresh()');

 if(process.env.TRAILMARK_TEST_MINI_ONLY==='1'){
  await miniRun('document.querySelector("[data-mini-tab=tasks]").click();document.getElementById("mini-appearance-toggle").click();document.getElementById("mini-theme").value="dark";document.getElementById("mini-theme").dispatchEvent(new Event("change"))');await wait(200);
  await miniRun('document.getElementById("mini-skin").value="slate";document.getElementById("mini-skin").dispatchEvent(new Event("change"))');await wait(200);await miniRun('document.querySelector("[data-mini-accent=teal]").click()');await wait(200);assert.equal(prefs.settings.accent,'teal');assert.equal(prefs.settings.skin,'slate');assert.equal(await miniRun('getComputedStyle(document.documentElement).getPropertyValue("--bg").trim()'),'#202020');
  await miniRun('document.getElementById("mini-appearance-toggle").click();{const rows=[...document.querySelectorAll(".mini-task")],data=new DataTransfer();rows[0].querySelector("[data-task-grip]").dispatchEvent(new DragEvent("dragstart",{bubbles:true,dataTransfer:data}));refresh()}');assert(await miniRun('window.TrailmarkTaskTools.dragging'));
  const dragFirst=await miniRun('document.querySelector(".mini-task").dataset.taskDrag');const dragSecond=await miniRun('document.querySelectorAll(".mini-task")[1].dataset.taskDrag');
  await miniRun('{const target=document.querySelectorAll(".mini-task")[1],data=new DataTransfer(),box=target.getBoundingClientRect();target.dispatchEvent(new DragEvent("dragover",{bubbles:true,cancelable:true,dataTransfer:data,clientY:box.bottom-1}));target.dispatchEvent(new DragEvent("drop",{bubbles:true,cancelable:true,dataTransfer:data,clientY:box.bottom-1}))}');await wait(200);assert.equal(await miniRun('window.TrailmarkTasks.pending(state.tasks)[0].id'),dragSecond);assert.equal(await miniRun('window.TrailmarkTasks.pending(state.tasks)[1].id'),dragFirst);assert.equal(await miniRun('window.TrailmarkTaskTools.dragging'),false);
 console.log('CHECK: task details');
  await run('navigateToView("tasks");document.querySelector("[data-task-tool=edit]").click()');assert(await run('document.getElementById("task-details").open'));
  await run('const form=document.querySelector("#task-details form");form.elements.description.value="Reference notes\\n- Review artwork\\n- Export final";form.elements.priority.value="1";form.elements.estimateMinutes.value="17";form.elements.link.value="https://example.com/reference";form.requestSubmit()');await until('!document.getElementById("task-details").open && state.tasks.some(t=>t.estimateMinutes===17)');assert((await prefs.get()).tasks.some(t=>t.description?.includes('Review artwork')));
  console.log('CHECK: cross-window timer');const timedId=(await prefs.get()).tasks.find(t=>t.estimateMinutes===17).id;assert.equal((await prefs.get()).tasks.find(t=>t.id===timedId).priority,1);
  await run('document.querySelector("[data-task-tool=time]").click()');await wait(300);await miniRun('refresh()');assert(await miniRun('state.tasks.some(t=>t.timingStartedAt)'));
  await miniRun('document.querySelector("[data-mini-tab=tasks]").click();document.querySelector("[data-task-tool=time]").click()');await wait(250);assert.equal((await prefs.get()).tasks.find(t=>t.id===timedId).timingStartedAt,null);assert((await prefs.get()).tasks.find(t=>t.id===timedId).timedMs>0);
  await miniRun('document.querySelector("[data-task-tool=down]").click()');await wait(200);await run('refresh()');assert.equal((await prefs.get()).tasks.find(t=>t.id===timedId).priority,3);
  console.log('CHECK: news editions');await run('navigateToView("news")');assert(await run('document.querySelector("#news-options [name=newsCountry]").options.length>=190'));
  await run('const f=document.getElementById("news-options");f.elements.newsScope.value="local";f.elements.newsLocal.value="Portland, Oregon";f.requestSubmit()');await wait(200);assert.equal(prefs.settings.newsLocal,'Portland, Oregon');assert.equal(prefs.settings.newsScope,'local');
  mini.show();mini.setSize(320,480);await wait(100);assert(await miniRun('document.body.scrollWidth<=document.body.clientWidth'));await fs.writeFile(path.join(__dirname,'../artifacts/trailmark-mini-tasks.png'),(await captureWindow(mini)).toPNG());
  const oldRead=clipboard.readText,oldWrite=clipboard.writeText,oldFormats=clipboard.availableFormats;let copied='Mini clipboard fixture';clipboard.readText=()=>copied;clipboard.writeText=value=>copied=value;clipboard.availableFormats=()=>['text/plain'];
  await miniRun('window.trailmark.saveCurrentClipboard();document.querySelector("[data-mini-tab=clipboard]").click()');await wait(200);await miniRun('refreshMiniClipboard(true)');assert.equal(await miniRun('document.querySelectorAll(".mini-clip").length'),1);
  await miniRun('document.querySelector("[data-mini-copy]").click()');await wait(150);assert.equal(copied,'Mini clipboard fixture');
  await miniRun('document.querySelector("[data-mini-pin]").click()');await wait(150);assert(await miniRun('document.querySelector("[data-mini-pin]").textContent.includes("Pinned")'));
  const {nativeImage,shell}=require('electron'),oldImageRead=clipboard.readImage,oldImageWrite=clipboard.writeImage;const imageFixture=nativeImage.createFromBitmap(Buffer.from([255,120,30,255,255,120,30,255,255,120,30,255,255,120,30,255]),{width:2,height:2});let recalledImage=null;clipboard.readImage=()=>imageFixture;clipboard.writeImage=image=>recalledImage=image.toPNG();clipboard.availableFormats=()=>['image/png'];
  await miniRun('window.trailmark.saveCurrentClipboard()');await run('navigateToView("clipboard")');await wait(200);await run('document.querySelector("[data-action=clip-filter][data-value=images]").click()');assert.equal(await run('document.querySelectorAll(".clip-image-row").length'),1);
  await run('document.querySelector("[data-action=clip-select]").click();document.querySelector("[data-action=clip-image]").click()');await wait(150);assert(await run('document.getElementById("modal").open && !!document.querySelector(".clip-full-image")'));await run('document.querySelector("[data-action=close-modal]").click();document.querySelector("[data-action=clip-copy]").click()');await wait(150);assert.deepEqual(nativeImage.createFromBuffer(recalledImage).toBitmap(),imageFixture.toBitmap());win.show();await fs.writeFile(path.join(__dirname,'../artifacts/trailmark-image-history.png'),(await captureWindow(win)).toPNG());
  await miniRun('refreshMiniClipboard(true);document.getElementById("mini-clip-filter").value="images";document.getElementById("mini-clip-filter").dispatchEvent(new Event("change"))');await wait(150);assert.equal(await miniRun('document.querySelectorAll(".mini-clip-image").length'),1);clipboard.readImage=oldImageRead;clipboard.writeImage=oldImageWrite;clipboard.availableFormats=()=>['text/plain'];
  await prefs.update(value=>{value.launchers=[{id:'launch-fixture',path:process.execPath,name:'Editor fixture',launches:0}];});const oldOpen=shell.openPath;let launchedPath=null;shell.openPath=async file=>{launchedPath=file;return '';};await miniRun('refresh()');await miniRun('document.querySelector("[data-mini-tab=launcher]").click();document.querySelector("[data-launcher-open=launch-fixture]").click()');await wait(200);assert.equal(launchedPath,process.execPath);assert.equal((await prefs.get()).launchers[0].launches,1);shell.openPath=oldOpen;await miniRun('document.querySelector("[data-mini-tab=clipboard]").click();document.getElementById("mini-clip-filter").value="recent";document.getElementById("mini-clip-filter").dispatchEvent(new Event("change"))');
  await miniRun('document.getElementById("mini-clip-search").value="no-match";document.getElementById("mini-clip-search").dispatchEvent(new Event("input"))');assert.equal(await miniRun('document.querySelectorAll(".mini-clip").length'),0);
  await miniRun('document.querySelector("[data-mini-tab=focus]").click()');mini.setSize(320,480);await wait(150);assert(await miniRun('const el=document.querySelector(".mini-main");el.scrollTop=el.scrollHeight;el.scrollTop>0'));assert(await miniRun('document.body.scrollWidth<=document.body.clientWidth'));
  clipboard.readText=oldRead;clipboard.writeText=oldWrite;clipboard.availableFormats=oldFormats;assert.deepEqual(errors,[]);console.log('PASS: mini tabs, all tasks, scrolling at 320x480, clipboard save/copy/pin/search, tracking, focus, completion and undo');clearTimeout(timeout);cleanupTools();app.exit(0);return;
 }
 // System monitoring is real; termination is rejected for protected / stale targets without ending user apps.
 const monitor=require(path.join(base,'main/system-monitor'));
 for(let i=0;i<200&&!monitor.state().sampledAt;i++)await wait(100);
 for(let i=0;i<200&&!monitor.state().apps.some(a=>a.history.length>=2);i++)await wait(100);assert(monitor.state().apps.some(a=>a.history.length>=2),'System sampler must keep updating');
 assert(monitor.state().sampledAt,'System scanner did not return data');assert.equal(monitor.state().error,null);assert(monitor.state().apps.length>0);assert(monitor.state().totalRam>0);assert(monitor.state().disks.some(d=>d.total>0&&d.free>=0));
 await assert.rejects(monitor.endApp('unknown',[]),/cannot be ended/);
 const protectedApp=monitor.state().apps.find(a=>!a.canEnd);assert(protectedApp);await assert.rejects(monitor.endApp(protectedApp.id,protectedApp.processes),/cannot be ended/);
 // End only a disposable process created by this test, with a unique executable path.
 const cp=require('node:child_process');const nodeExe=cp.execFileSync('where.exe',['node'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/)[0];const fixtureExe=path.join(profile,'MonitorFixture.exe');await fs.copyFile(nodeExe,fixtureExe);const disposable=cp.spawn(fixtureExe,['-e','setInterval(()=>{},1000)'],{windowsHide:true,stdio:'ignore'});let fixtureApp;
 try{for(let i=0;i<150;i++){fixtureApp=monitor.state().apps.find(a=>a.processes.some(p=>p.pid===disposable.pid));if(fixtureApp)break;await wait(100);}assert(fixtureApp&&fixtureApp.canEnd);assert.equal(fixtureApp.processes.length,1);await monitor.endApp(fixtureApp.id,fixtureApp.processes);for(let i=0;i<50&&disposable.exitCode===null&&disposable.signalCode===null;i++)await wait(100);assert(disposable.exitCode!==null||disposable.signalCode!==null,'Disposable app was not ended');}finally{if(disposable.exitCode===null&&disposable.signalCode===null)disposable.kill();}
 const normalApp=monitor.state().apps.find(a=>a.canEnd);if(normalApp)await assert.rejects(monitor.endApp(normalApp.id,[]),/processes changed/);
 assert.equal((await prefs.get()).settings.newsEnabled,false);
 await run('navigateToView("system")');await run('refresh()');assert(await run('document.querySelectorAll(".resource-row").length>0'));
 await run('document.querySelector("[data-action=sys-clocks]").click();document.querySelector("[data-city=London]").click();document.querySelector("[data-city=Tokyo]").click();document.getElementById("save-cities").click()');await until('state.settings.worldClocks.length===2 && !document.getElementById("modal").open');assert.equal(await run('document.querySelectorAll(".world-clock").length'),2);assert(await run('document.querySelector(".clock-time").textContent.length>0'));
 // Four-headline UI and opt-in behavior use a deterministic feed; the live endpoint is checked separately.
 const https=require('https'),{EventEmitter}=require('events'),originalGet=https.get;
 https.get=(_url,_options,callback)=>{const req=new EventEmitter();req.setTimeout=()=>req;req.destroy=error=>req.emit('error',error);setImmediate(()=>{const response=new EventEmitter();response.statusCode=200;response.setEncoding=()=>{};callback(response);setImmediate(()=>{response.emit('data','<rss>'+Array.from({length:5},(_,i)=>'<item><title>World update '+(i+1)+' &amp; context</title><link>https://www.bbc.com/news/test-'+i+'</link></item>').join('')+'</rss>');response.emit('end');});});return req;};
 try{await run('document.querySelector("[data-action=sys-news-toggle]").click()');await until('state.settings.newsEnabled && document.querySelectorAll(".news-headline").length===4');assert(await run('document.querySelector(".news-headline").textContent.includes("& context")'));await run('document.querySelector("[data-action=sys-news-toggle]").click()');await until('!state.settings.newsEnabled && document.querySelectorAll(".news-headline").length===0');}finally{https.get=originalGet;}
 const started=(await prefs.get()).tasks.find(t=>t.startedAt);assert(started);await run('navigateToView("tasks")');assert(await run('document.querySelector("[data-task-elapsed]").textContent.includes("Started")'));
 // Public screenshots use sample resources rather than the user's actual app names, drive labels or IP addresses.
 await run('navigateToView("system");state.system={running:true,sampledAt:Date.now(),cpu:18.5,totalRam:34359738368,freeRam:21474836480,gpuAvailable:true,apps:[{id:"sample",name:"Design studio",cpu:16.2,ram:1395864371,gpu:8.4,spike:true,canEnd:true,processes:[{pid:123,start:"12345678901234567"}],history:[2,3,2,5,7,4,3,5,12,16]}],disks:[{name:"C:",label:"Workspace",type:"Fixed",total:1099511627776,free:659706976665}],addresses:[{name:"Wi-Fi",address:"192.168.1.24"}]};renderView();document.getElementById("toast").className=""');
 await run('document.querySelector("[data-action=sys-end]").click()');assert(await run('document.getElementById("modal").textContent.includes("Unsaved work")'));await run('document.getElementById("modal").close()');await wait(250);await fs.writeFile(path.join(__dirname,'../artifacts/trailmark-system.png'),(await captureWindow(win)).toPNG());await run('refresh()');
 // Clipboard UI uses simulated OS text to leave the user's clipboard untouched; disk encryption is real.
 const clip=require(path.join(base,'main/clipboard'));const originalClipboard={readText:clipboard.readText,writeText:clipboard.writeText,availableFormats:clipboard.availableFormats};let virtualClipboard='Before enabling';
 clipboard.readText=()=>virtualClipboard;clipboard.writeText=text=>virtualClipboard=text;clipboard.availableFormats=()=>['text/plain'];
 assert(safeStorage.isEncryptionAvailable());await run('navigateToView("clipboard")');await wait(100);assert.equal(await run('clipboardViewState.enabled'),false);
 await run('document.querySelector("[data-action=clip-enable]").click()');await until('state.settings.clipboardEnabled && clipboardViewState.running');
 virtualClipboard='https://example.com/research-notes';await clip.poll();virtualClipboard='A useful sentence to remember.\nAnother line, kept intact.';await clip.poll();virtualClipboard='<img src=x onerror="window.clipInjection=true">';await clip.poll();await run('refresh()');
 await until('document.querySelectorAll(".clip-row").length===3');assert.equal(await run('!!window.clipInjection'),false);assert.equal(await run('document.querySelectorAll("#clip-list img").length'),0);
 await run('document.getElementById("clip-search").value="research";document.getElementById("clip-search").dispatchEvent(new Event("input",{bubbles:true}))');assert.equal(await run('document.querySelectorAll(".clip-row").length'),1);
 await run('document.querySelector("[data-action=clip-select]").click();document.querySelector("[data-action=clip-pin]").click()');await until('clipboardViewState.items.some(c=>c.pinned)');
 await run('document.querySelector(".clip-detail [data-action=clip-copy]").click()');await wait(100);assert.equal(virtualClipboard,'https://example.com/research-notes');await clip.poll();assert.equal((await clip.get()).items.length,3);
 const unsafe=(await clip.get()).items.find(c=>c.text.startsWith('<img'));await clip.remove(unsafe.id);virtualClipboard='Draft: a short client update for Friday';await clip.saveCurrent();await run('refresh()');
 const encryptedFile=path.join(profile,'trailmark-clipboard.json');assert(!(await fs.readFile(encryptedFile,'utf8')).includes('research-notes'));
 await run('document.getElementById("clip-search").value="";document.getElementById("clip-search").dispatchEvent(new Event("input",{bubbles:true}))');
 await run('document.querySelector("[data-action=clip-clear]").click();document.querySelector("[data-action=clip-clear-recent]").click()');await until('clipboardViewState.items.length===3 && clipboardViewState.items.every(c=>c.archivedAt) && !document.getElementById("modal").open');assert.equal(await run('document.querySelectorAll(".clip-row").length'),0);
 await run('document.querySelector("[data-action=clip-filter][data-value=history]").click()');await until('document.querySelectorAll(".clip-row").length===3');
 await miniRun('document.querySelector("[data-mini-tab=clipboard]").click();document.getElementById("mini-clip-filter").value="all";refreshMiniClipboard(true)');await wait(250);assert.equal(await miniRun('document.querySelectorAll(".mini-clip").length'),3);
 await miniRun('document.querySelector("[data-mini-copy]").click()');await wait(150);assert(virtualClipboard.length>0);
 await miniRun('document.querySelector("[data-mini-tab=focus]").click()');
 await run('document.querySelector("[data-action=clip-enable]").click()');await until('!state.settings.clipboardEnabled');await run('selectedClip=clipboardViewState.items.find(c=>c.pinned).id;renderClipboardLists()');
 await run('document.getElementById("toast").className=""');await wait(250);await fs.writeFile(path.join(__dirname,'../artifacts/trailmark-clipboard.png'),(await captureWindow(win)).toPNG());
 await run('document.querySelector("[data-action=clip-clear]").click();document.querySelector("[data-action=clip-delete-confirm]").click();document.querySelector("[data-action=clip-delete-all]").click()');await until('clipboardViewState.items.length===0 && !document.getElementById("modal").open');
 assert.equal(await fs.access(encryptedFile).then(()=>true,()=>false),false);assert.equal(virtualClipboard,'Draft: a short client update for Friday');
 Object.assign(clipboard,originalClipboard);
 // Actual Windows Core Audio scanner, authenticated browser reports, exact-tab commands, and helper files.
 const media=require(path.join(base,'main/media'));await run('navigateToView("media")');await run('document.querySelector("[data-action=media-toggle]").click()');
 for(let i=0;i<150&&!media.state().lastUpdated;i++)await wait(100);assert(media.state().lastUpdated,'Native Core Audio scanner did not respond');assert.equal(media.state().error,null);
 const paired=await run('window.trailmark.pairMedia()');assert(paired.success);const origin='chrome-extension://'+ 'a'.repeat(32);const endpoint='http://127.0.0.1:'+paired.data.port+'/tabs';
 const report={browser:'Chrome',clientId:'a'.repeat(32),tabs:[{id:19,title:'Video lecture — design that stays out of the way',url:'https://example.com/lecture',muted:false}]};
 const rejected=await fetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer invalid'},body:JSON.stringify(report)});assert.equal(rejected.status,403);
 let response=await fetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+paired.data.token},body:JSON.stringify(report)});assert.equal(response.status,200);
 await run('refresh()');await until('document.querySelectorAll(".audible-tab").length===1');await run('document.querySelector("[data-command=focus]").click()');await wait(100);
 response=await fetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer '+paired.data.token},body:JSON.stringify(report)});const browserCommand=await response.json();assert.equal(browserCommand.command.id,19);assert.equal(browserCommand.command.action,'focus');
 const helperFolder=await media.prepareHelper();const manifest=JSON.parse(await fs.readFile(path.join(helperFolder,'manifest.json'),'utf8'));assert(manifest.permissions.includes('tabs'));assert(!manifest.permissions.includes('tabCapture'));
 await run('mediaViewState.apps=[{processId:101,appName:"chrome",title:"Video lecture — design that stays out of the way",peak:.28},{processId:102,appName:"Spotify",title:"A little background music",peak:.12}];renderMediaSources();document.getElementById("toast").className=""');await wait(250);await fs.writeFile(path.join(__dirname,'../artifacts/trailmark-media.png'),(await captureWindow(win)).toPNG());
 await run('document.querySelector("[data-action=media-toggle]").click()');await until('!mediaViewState.running');media.shutdown();
 // Check the minimum supported size for horizontal overflow.
 win.setSize(900,650);await wait(150);for(const view of ['today','system','tasks','clipboard','media','timeline','projects','insights','settings']) {await run('navigateToView('+JSON.stringify(view)+')');assert(await run('document.getElementById("main-content").scrollWidth<=document.getElementById("main-content").clientWidth'));}await run('navigateToView("today")');
 await run('document.getElementById("toast").className=""');await wait(250);await fs.writeFile(path.join(__dirname,'../artifacts/trailmark-compact.png'),(await captureWindow(win)).toPNG());
 win.setSize(1360,860);await wait(150);
 await run('navigateToView("timeline")');
 await run('document.getElementById("toast").className=""');await wait(250);await fs.writeFile(path.join(__dirname,'../artifacts/trailmark-timeline.png'),(await captureWindow(win)).toPNG());
 await run('window.trailmark.maximize()');await wait(100);assert(win.isMaximized());await run('window.trailmark.maximize()');await wait(100);assert(!win.isMaximized());
 await run('window.trailmark.minimize()');await wait(100);assert(win.isMinimized());win.restore();
 await run('window.trailmark.close()');await wait(100);assert(!win.isVisible());assert(!win.isDestroyed());win.show();
 await prefs.saveSettings({trackTitles:false,trackPaths:false,excludedApps:''});
 await tracker.startTracking();await wait(100);const captured=tracker.getTrackingState().activeWindow;assert(captured);assert.equal(captured.title,captured.appName);assert.equal(captured.path,'');await tracker.stopTracking();
 await prefs.saveSettings({excludedApps:captured.appName});await tracker.startTracking();assert.equal(tracker.getTrackingState().activeWindow,null);await tracker.stopTracking();
 await tracker.clearData();assert.equal((await store.getEntries()).length,0);
 assert.deepEqual(errors,[]);
 console.log('PASS: task capture / grouping / completion / Undo, linked focus, live mini companion, five skins / accents, opt-in custom shortcuts, native tracking, encrypted clipboard / archive / permanent deletion, native audio monitoring / browser bridge, nine views, native per-app CPU/RAM/GPU counters, disk/network data, task ages and world clocks, project creation and assignment, search, real CSV/JSON exports, focus timer, persistent preferences, privacy controls, close-to-tray, minimum-size layout and injection escaping');
 clearTimeout(timeout);cleanupTools();app.exit(0);
}).catch(error=>{console.error(error);clearTimeout(timeout);cleanupTools();app.exit(1);});
