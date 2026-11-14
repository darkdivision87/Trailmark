const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
function preferencesFixture(){
 let nextId=0;const files=new Map();const module={exports:{}};
 const io={mkdir:async()=>{},readFile:async file=>{if(!files.has(file))throw Object.assign(new Error('Missing'),{code:'ENOENT'});return files.get(file);},writeFile:async(file,data)=>{await Promise.resolve();files.set(file,data);},rename:async(from,to)=>{files.set(to,files.get(from));files.delete(from);}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../main/preferences'),'utf8'),{module,require:name=>({fs:{promises:io},path,electron:{app:{getPath:()=>'/virtual/trailmark'}},'../renderer/shortcuts':require('../renderer/shortcuts'),'../renderer/productivity':require('../renderer/productivity'),crypto:{randomUUID:()=> 'id-'+(++nextId)}}[name]),structuredClone,setTimeout,console,URL});
 return {prefs:module.exports,files};
}

test('task metadata validates, reorders across priorities, and persists measured time',async()=>{
 const {prefs,files}=preferencesFixture();await prefs.ready;
 await prefs.saveTask({title:'Draft',priority:1,estimateMinutes:20,link:'https://example.com/doc'});await prefs.saveTask({title:'Review',priority:5});
 let [a,b]=(await prefs.get()).tasks;assert.equal(a.estimateMinutes,20);assert.equal(a.link,'https://example.com/doc');
 await assert.rejects(prefs.saveTask({id:a.id,priority:0}),/priority/);await assert.rejects(prefs.saveTask({id:a.id,estimateMinutes:-1}),/estimate/);await assert.rejects(prefs.saveTask({id:a.id,link:'javascript:alert(1)'}),/http/);
 await prefs.moveTask(b.id,a.id);assert.equal((await prefs.get()).tasks[1].priority,1);assert.deepEqual(require('../renderer/productivity').pending((await prefs.get()).tasks).map(t=>t.id),[b.id,a.id]);
 await prefs.timeTask(a.id,true);await prefs.update(v=>v.tasks[0].timingStartedAt=Date.now()-2000);await prefs.timeTask(b.id,true);let tasks=(await prefs.get()).tasks;assert(tasks[0].timedMs>=2000);assert.equal(tasks[0].timingStartedAt,null);assert(tasks[1].timingStartedAt);
 await prefs.completeTask(b.id,true);tasks=(await prefs.get()).tasks;assert.equal(tasks[1].timingStartedAt,null);assert(Number.isFinite(tasks[1].timedMs));assert.equal(JSON.parse([...files.values()][0]).tasks[0].link,a.link);
 await prefs.saveSettings({newsScope:'local',newsLocal:'Portland, Oregon',newsCountry:'CA'});assert.equal(prefs.settings.newsLocal,'Portland, Oregon');assert.throws(()=>prefs.saveSettings({newsScope:'invalid'}),/news scope/);
});
test('overlapping appearance and general preference saves preserve both changes',async()=>{
 const {prefs,files}=preferencesFixture();await prefs.ready;
 await Promise.all([prefs.saveSettings({theme:'dark'}),prefs.saveSettings({dailyGoalHours:8})]);
 const saved=await prefs.get();assert.equal(saved.settings.theme,'dark');assert.equal(saved.settings.dailyGoalHours,8);
 const disk=JSON.parse([...files.values()][0]);assert.equal(disk.settings.theme,'dark');assert.equal(disk.settings.dailyGoalHours,8);
});
test('rapid appearance choices keep the last choice without resetting other settings',async()=>{
 const {prefs}=preferencesFixture();await prefs.ready;await prefs.saveSettings({idleMinutes:15});
 await Promise.all(['dark','light','system','dark'].map(theme=>prefs.saveSettings({theme})));
 assert.equal(prefs.settings.theme,'dark');assert.equal(prefs.settings.idleMinutes,15);
});

test('task updates persist atomically, enforce one priority, and completion is idempotent and reversible',async()=>{
 const {prefs,files}=preferencesFixture();await prefs.ready;
 await prefs.saveTask({title:'Write the outline',oneThing:true});await prefs.saveTask({title:'Review the draft',oneThing:true});
 let saved=await prefs.get();assert.equal(saved.tasks.length,2);assert.equal(saved.tasks.filter(t=>t.oneThing).length,1);
 const task=saved.tasks[0];await prefs.completeTask(task.id,true);const completed=(await prefs.get()).tasks[0].completedAt;await prefs.completeTask(task.id,true);assert.equal((await prefs.get()).tasks[0].completedAt,completed);
 await prefs.completeTask(task.id,false);assert.equal((await prefs.get()).tasks[0].completedAt,null);
 await assert.rejects(prefs.saveTask({title:' ',projectId:''}),/Write a task/);await assert.rejects(prefs.saveTask({title:'Task',projectId:'unknown'}),/existing project/);
 assert.equal(JSON.parse([...files.values()][0]).tasks.length,2);
});
test('skins and accents validate and do not replace tasks or unrelated preferences',async()=>{const {prefs}=preferencesFixture();await prefs.ready;await prefs.saveTask({title:'Keep me'});await Promise.all([prefs.saveSettings({skin:'midnight',accent:'blue'}),prefs.saveSettings({autoStart:true})]);const saved=await prefs.get();assert.equal(saved.settings.skin,'midnight');assert.equal(saved.settings.accent,'blue');assert.equal(saved.settings.autoStart,true);assert.equal(saved.tasks.length,1);assert.throws(()=>prefs.saveSettings({skin:'invalid'}),/Invalid skin/);});

test('task start is explicit, persistent and idempotent; clocks validate before saving',async()=>{const {prefs}=preferencesFixture();await prefs.ready;await prefs.saveTask({title:'Write'});let task=(await prefs.get()).tasks[0];assert.equal(task.startedAt,undefined);await prefs.startTask(task.id);const started=(await prefs.get()).tasks[0].startedAt;await prefs.startTask(task.id);assert.equal((await prefs.get()).tasks[0].startedAt,started);await prefs.completeTask(task.id,true);await assert.rejects(prefs.startTask(task.id),/unfinished/);await prefs.saveSettings({worldClocks:[{name:'London',zone:'Europe/London'}]});assert.equal(prefs.settings.worldClocks.length,1);assert.throws(()=>prefs.saveSettings({worldClocks:[{name:'Invalid',zone:'Bad/Zone'}]}),/Invalid time zone/);assert.equal(prefs.settings.newsEnabled,false);});
