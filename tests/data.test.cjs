const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../renderer/data');
const day = '2026-10-01';const [start,end]=D.bounds(day);
const entry = (id,at,seconds,app,title=app) => ({id,timestamp:at,duration:seconds,window:{appName:app,appKey:app,title}});
test('clips sessions across local midnight without double counting',()=>{
 const e=entry('a',start-1800000,3600,'code');
 assert.equal(D.summary([e],start,end).total,1800);
 assert.equal(D.clip([e],start-86400000,start)[0].duration,1800);
});
test('application switches differ from title changes; hourly time reconciles',()=>{
 const data=[entry('a',start+3600000,60,'code','One'),entry('b',start+3660000,60,'code','Two'),entry('c',start+3720000,120,'chrome')];
 const s=D.summary(data,start,end);
 assert.equal(s.switches,1);assert.equal(s.total,240);assert.equal(s.apps.length,2);
 assert.equal(s.hours.reduce((a,b)=>a+b,0),s.total);
});
test('hourly chart splits sessions between hours',()=>{
 const s=D.summary([entry('a',start+3590000,30,'code')],start,end);
 assert.equal(s.hours[0],10);assert.equal(s.hours[1],20);
});
test('project rules honor explicit unassigned and manual overrides',()=>{
 const projects=[{id:'p1',keywords:'design, Figma',name:'Design'},{id:'p2',keywords:'',name:'Other'}];
 const e=entry('a',start,60,'Figma');
 assert.equal(D.projectFor(e,projects).id,'p1');
 assert.equal(D.projectFor({...e,projectId:''},projects),null);
 assert.equal(D.projectFor({...e,projectId:'p2'},projects).id,'p2');
 assert.equal(D.projectFor({...e,projectId:null},projects).id,'p1');
});
test('search and date/app/project filters combine',()=>{
 const projects=[{id:'p1',keywords:'design',name:'Design'}];
 const data=[entry('a',start,90,'code','Design notes'),entry('b',start,40,'chrome','Read docs'),entry('c',start-86400000,30,'code','Design')];
 const filtered=D.filter(data,{start:day,end:day,query:'notes',app:'visual studio code',project:'p1'},projects);
 assert.deepEqual(filtered.map(e=>e.id),['a']);
});
test('legacy activity files remain readable and group by executable',()=>{
 const s=D.summary([{id:'old',timestamp:start,duration:100,window:{title:'README - code',path:'C:\\VSCode\\code.exe'}}],start,end);
 assert.equal(s.apps[0].name,'Visual Studio Code');assert.equal(s.total,100);
});
