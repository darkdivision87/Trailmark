const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const { randomUUID } = require('crypto');
const ShortcutModel=require('../renderer/shortcuts');
const defaults = { systemEnabled:true,newsEnabled:false,newsScope:"global",newsCountry:"US",newsLocal:"",worldClocks:[], clipboardEnabled:false,clipboardDays:90, theme: 'light', skin:'graphite', accent:'green', autoStart: false, closeToTray: true, idleMinutes: 5, pollSeconds: 2, retentionDays: 30, trackTitles: true, trackPaths: false, excludedApps: '', dailyGoalHours: 6, notifications: true, shortcuts: ShortcutModel.empty() };
class Preferences {
  constructor() {
    this.file = path.join(app.getPath('userData'), 'trailmark-preferences.json');
    this.value = { settings: {...defaults}, projects: [], tasks:[],launchers:[] };
    this.ready = this.load();
    this.queue = this.ready;
  }
  async load() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    try {
      const saved = JSON.parse(await fs.readFile(this.file, 'utf8'));
      this.value = { settings: {...defaults, ...saved.settings, shortcuts: ShortcutModel.normalize(saved.settings?.shortcuts)}, launchers:Array.isArray(saved.launchers)?saved.launchers:[], projects: Array.isArray(saved.projects) ? saved.projects : [], tasks:Array.isArray(saved.tasks)?saved.tasks.map((t,i)=>({...t,priority:t.priority??3,order:t.order??i})):[] };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  get settings() { return this.value.settings; }
  async get() { await this.ready; return structuredClone(this.value); }
  update(mutator) {
    const task = this.queue.then(async () => {
      const next = structuredClone(this.value);
      mutator(next);
      await fs.writeFile(this.file + '.tmp', JSON.stringify(next, null, 2));
      for (let attempt = 0; ; attempt++) {
        try { await fs.rename(this.file + '.tmp', this.file); break; }
        catch (error) {
          if (!['EPERM','EACCES','EBUSY'].includes(error.code) || attempt === 5) throw error;
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 30));
        }
      }
      this.value = next;
      return structuredClone(next);
    });
    this.queue = task.catch(() => {});
    return task;
  }
  saveSettings(input) {
    const patch = {};
    if(input.newsScope!==undefined){if(!['global','local','us','country'].includes(input.newsScope))throw new Error('Invalid news scope.');patch.newsScope=input.newsScope;}
    if(input.newsCountry!==undefined){const code=String(input.newsCountry).toUpperCase();if(!/^[A-Z]{2}$/.test(code))throw new Error('Choose a country code.');try{if(new Intl.DisplayNames(['en'],{type:'region'}).of(code)===code)throw new Error();}catch{throw new Error('Choose a recognized country.');}patch.newsCountry=code;}
    if(input.newsLocal!==undefined)patch.newsLocal=String(input.newsLocal).trim().slice(0,120);
    if(input.worldClocks!==undefined){if(!Array.isArray(input.worldClocks)||input.worldClocks.length>12)throw new Error('Choose up to 12 cities.');patch.worldClocks=input.worldClocks.map(c=>{const name=String(c.name||'').trim().slice(0,60),zone=String(c.zone||'');if(!name)throw new Error('Give the city a name.');try{new Intl.DateTimeFormat('en',{timeZone:zone}).format();}catch{throw new Error('Invalid time zone.');}return {name,zone};});}

    if(input.clipboardDays!==undefined){if(![0,30,90,365].includes(Number(input.clipboardDays)))throw new Error('Invalid clipboard retention');patch.clipboardDays=Number(input.clipboardDays);}
    if(input.clipboardEnabled===true&&!require('electron').safeStorage.isEncryptionAvailable())throw new Error('Encrypted clipboard storage is unavailable.');
    for(const [key,allowed] of [['skin',['graphite','slate','midnight','sand','plum']],['accent',['green','blue','violet','amber','rose','teal','orange']]])if(input[key]!==undefined){if(!allowed.includes(input[key]))throw new Error('Invalid '+key);patch[key]=input[key];}
    if(input.shortcuts!==undefined)patch.shortcuts=ShortcutModel.normalize(input.shortcuts);
    for (const key of ['systemEnabled','newsEnabled','clipboardEnabled','autoStart','closeToTray','trackTitles','trackPaths','notifications']) {
      if (typeof input[key] === 'boolean') patch[key] = input[key];
    }
    for (const [key,min,max] of [['idleMinutes',1,60],['pollSeconds',1,30],['dailyGoalHours',1,24]]) {
      if (input[key] !== undefined) {
        const value = Number(input[key]);
        if (!Number.isFinite(value) || value < min || value > max) throw new Error('Invalid setting: ' + key);
        patch[key] = value;
      }
    }
    if (input.retentionDays !== undefined) {
      if (![7,30,90,180,365].includes(Number(input.retentionDays))) throw new Error('Invalid retention period');
      patch.retentionDays = Number(input.retentionDays);
    }
    if (input.theme !== undefined) {
      if (!['light','dark','system'].includes(input.theme)) throw new Error('Invalid theme');
      patch.theme = input.theme;
    }
    if (typeof input.excludedApps === 'string') patch.excludedApps = input.excludedApps.trim().slice(0,2000);
    return this.update(value => { value.settings = {...value.settings, ...patch}; });
  }
  saveProject(input) {
    const name = String(input.name || '').trim().slice(0,80);
    if (!name) throw new Error('Give your project a name.');
    const colors = ['#327968','#c07d46','#7575ad','#5c85ab','#ad6c81','#90954e'];
    const project = { id: input.id || randomUUID(), name, type:String(input.type||'Work').trim().slice(0,40)||'Work', keywords: String(input.keywords || '').trim().slice(0,1000), color: colors.includes(input.color) ? input.color : colors[0] };
    return this.update(value => {
      const index = value.projects.findIndex(p => p.id === project.id);
      if (index < 0) value.projects.push(project); else value.projects[index] = project;
    });
  }
  deleteProject(id) { return this.update(value => { value.projects = value.projects.filter(p => p.id !== id);for(const task of value.tasks)if(task.projectId===id){task.type=this.value.projects.find(p=>p.id===id)?.type||task.type;task.projectId='';} }); }
  saveTask(input) {
    return this.update(value=>{
      const previous=value.tasks.find(t=>t.id===input.id);
      if(input.id&&!previous)throw new Error('This task no longer exists.');
      const title=String(input.title??previous?.title??'').trim().slice(0,240);
      if(!title)throw new Error('Write a task first.');
      const projectId=input.projectId??previous?.projectId??'';
      if(projectId&&!value.projects.some(p=>p.id===projectId))throw new Error('Choose an existing project.');
      const task={...previous,id:previous?.id||randomUUID(),title,projectId,type:String(input.type??previous?.type??'Personal').trim().slice(0,40)||'Personal',createdAt:previous?.createdAt||Date.now(),completedAt:previous?.completedAt||null,today:typeof input.today==='boolean'?input.today:previous?.today??true,oneThing:typeof input.oneThing==='boolean'?input.oneThing:previous?.oneThing??false};
      if(task.oneThing)for(const other of value.tasks)other.oneThing=false;
      task.description=String(input.description??previous?.description??'').slice(0,20000);
      task.priority=Number(input.priority??previous?.priority??3);
      task.estimateMinutes=Number(input.estimateMinutes??previous?.estimateMinutes??0);
      if(!Number.isInteger(task.priority)||task.priority<1||task.priority>5)throw new Error('Choose priority 1–5.');
      if(!Number.isInteger(task.estimateMinutes)||task.estimateMinutes<0||task.estimateMinutes>10080)throw new Error('Choose an estimate of 0–10080 minutes.');
      task.link=String(input.link??previous?.link??'').trim();
      if(task.link){let url;try{url=new URL(task.link);}catch{throw new Error('Enter a complete http or https link.');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Enter a complete http or https link.');if(task.link.length>4096)throw new Error('Link is too long.');}
      task.order=previous?.order??value.tasks.length;
      const index=value.tasks.findIndex(t=>t.id===task.id);if(index<0)value.tasks.push(task);else value.tasks[index]=task;
    });
  }
  startTask(id){return this.update(value=>{const task=value.tasks.find(t=>t.id===id);if(!task||task.completedAt)throw new Error('Choose an unfinished task.');task.startedAt=task.startedAt||Date.now();});}
  completeTask(id,complete) {return this.update(value=>{const task=value.tasks.find(t=>t.id===id);if(!task)throw new Error('This task no longer exists.');if(complete&&task.timingStartedAt){task.timedMs=(task.timedMs||0)+Math.max(0,Date.now()-task.timingStartedAt);task.timingStartedAt=null;}task.completedAt=complete?(task.completedAt||Date.now()):null;});}
  timeTask(id,running){return this.update(value=>{const task=value.tasks.find(t=>t.id===id);if(!task||task.completedAt)throw new Error('Choose an unfinished task.');const now=Date.now();for(const other of value.tasks)if(other.timingStartedAt&&(!running||other.id!==id)){if(other.id!==id&&!running)continue;other.timedMs=(other.timedMs||0)+Math.max(0,now-other.timingStartedAt);other.timingStartedAt=null;}if(running){task.startedAt=task.startedAt||now;task.timingStartedAt=task.timingStartedAt||now;}});}
  moveTask(id,targetId,position){return this.update(value=>{const tasks=require('../renderer/productivity').pending(value.tasks),task=tasks.find(t=>t.id===id),target=tasks.find(t=>t.id===targetId);if(!task||!target||task===target)throw new Error('Choose two unfinished tasks.');const from=tasks.indexOf(task),to=tasks.indexOf(target);tasks.splice(from,1);const insertion=tasks.indexOf(target)+((position??(from<to?'after':'before'))==='after'?1:0);tasks.splice(insertion,0,task);task.priority=target.priority??3;task.oneThing=false;tasks.forEach((t,i)=>t.order=i);});}
  deleteTask(id){return this.update(value=>{value.tasks=value.tasks.filter(t=>t.id!==id);});}
}
module.exports = new Preferences();
