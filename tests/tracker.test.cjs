const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function trackerFixture(){
 let now=0,idle=0;let active={id:1,path:'C:\\PrivateFolder\\Code.exe',processId:1,getTitle:()=> 'Project A'};
 const entries=new Map();const settings={pollSeconds:2,idleMinutes:1,trackTitles:true,trackPaths:false,excludedApps:''};
 const store={addEntry:async e=>entries.set(e.id,structuredClone(e)),clear:async()=>entries.clear()};
 const module={exports:{}};let serial=0;
 vm.runInNewContext(fs.readFileSync(require.resolve('../main/tracker'),'utf8'),{module,require:name=>({electron:{BrowserWindow:{getAllWindows:()=>[]},powerMonitor:{getSystemIdleTime:()=>idle}},crypto:{randomUUID:()=>String(++serial)},'./store-instance':store,'./preferences':{settings,ready:Promise.resolve()},'node-window-manager':{windowManager:{getActiveWindow:()=>active}}}[name]),Date:class extends Date{static now(){return now;}},setInterval:()=>1,clearInterval:()=>{},console});
 return {tracker:module.exports,entries,settings,advance:(ms,idleSecs=0)=>{now+=ms;idle=idleSecs;},setActive:win=>{active=win;}};
}
test('stationary windows accrue time, switches finalize sessions, pauses exclude gaps',async()=>{
 const f=trackerFixture();await f.tracker.startTracking();for(let i=0;i<5;i++){f.advance(2000);await f.tracker.pollActiveWindow();}
 assert.equal([...f.entries.values()][0].duration,10);
 f.setActive({id:2,path:'C:\\Chrome.exe',processId:2,getTitle:()=> 'Research'});f.advance(2000);await f.tracker.pollActiveWindow();f.advance(2000);await f.tracker.stopTracking();
 assert.equal([...f.entries.values()].reduce((n,e)=>n+e.duration,0),14);assert.equal(f.entries.size,2);
 f.advance(120000);await f.tracker.startTracking();f.advance(2000);await f.tracker.stopTracking();assert.equal([...f.entries.values()].reduce((n,e)=>n+e.duration,0),16);
});
test('idle detection removes the grace period and resumes in a new session',async()=>{
 const f=trackerFixture();await f.tracker.startTracking();for(let i=0;i<10;i++){f.advance(2000);await f.tracker.pollActiveWindow();}
 for(let i=1;i<=30;i++){f.advance(2000,i*2);await f.tracker.pollActiveWindow();}
 assert(f.tracker.getTrackingState().idle);assert.equal([...f.entries.values()][0].duration,20);
 f.advance(2000,0);await f.tracker.pollActiveWindow();assert(!f.tracker.getTrackingState().idle);assert.equal(f.entries.size,2);await f.tracker.stopTracking();
});
test('privacy settings hide titles and paths, including identifiers; exclusion prevents entries',async()=>{
 const f=trackerFixture();f.settings.trackTitles=false;await f.tracker.startTracking();await f.tracker.stopTracking();
 const e=[...f.entries.values()][0];assert.equal(e.window.title,'Code');assert.equal(e.window.path,'');assert(!JSON.stringify(e).includes('PrivateFolder'));
 f.settings.excludedApps='code';await f.tracker.startTracking();assert.equal(f.tracker.getTrackingState().activeWindow,null);await f.tracker.stopTracking();assert.equal(f.entries.size,1);
});
test('sleep or long polling gaps do not invent active time',async()=>{
 const f=trackerFixture();await f.tracker.startTracking();f.advance(600000);await f.tracker.pollActiveWindow();await f.tracker.stopTracking();assert.equal([...f.entries.values()][0].duration,0);
});
test('focus completion respects notification preference',()=>{
 let callback,notifications=0;const settings={notifications:false};const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../main/focus'),'utf8'),{module,require:name=>({electron:{Notification:class{static isSupported(){return true;}show(){notifications++;}}},'./preferences':{settings},'./tracker':{notify:()=>{}}}[name]),Date,setTimeout:fn=>{callback=fn;return 1;},clearTimeout:()=>{}});
 const focus=module.exports;assert.throws(()=>focus.start(10));focus.start(25);callback();assert(focus.state().complete);assert.equal(notifications,0);
 settings.notifications=true;focus.start(50);callback();assert.equal(notifications,1);focus.stop();assert.equal(focus.state(),null);
});
