const fs=require('fs').promises,path=require('path'),os=require('os');
const {spawn,execFile}=require('child_process');
const {group}=require('./system-model');
let child=null,starting=null,generation=0;
let snapshot={running:false,apps:[],disks:[],addresses:[],error:null,sampledAt:null,totalRam:0,freeRam:0,cpu:null,gpuAvailable:false};
const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
function state(){return structuredClone(snapshot);}
function notify(){require('./tracker').notify();}
function start(){
  if(starting)return starting;
  starting=launch().finally(()=>{starting=null;});return starting;
}
async function launch(){
  if(child)return state();
  if(process.platform!=='win32'){snapshot.error='System monitoring currently supports Windows.';return state();}
  const epoch=++generation;const folder=await fs.mkdtemp(path.join(os.tmpdir(),'trailmark-system-'));
  if(epoch!==generation){await fs.rm(folder,{recursive:true,force:true});return;}
  const script=path.join(folder,'monitor.ps1');
  try{await fs.copyFile(path.join(__dirname,'system-monitor.ps1'),script);}catch(error){await fs.rm(folder,{recursive:true,force:true});throw error;}
  if(epoch!==generation){await fs.rm(folder,{recursive:true,force:true});return state();}
  child=spawn(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-ParentProcessId',String(process.pid)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  const proc=child,ownFolder=folder;let buffer='',errors='';snapshot.running=true;snapshot.error=null;
  proc.stdout.on('data',data=>{if(epoch!==generation)return;buffer+=data.toString();let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);try{const sample=JSON.parse(line);if(sample.error){snapshot.error=sample.error;}else{const apps=group(sample,new Map(snapshot.apps.map(a=>[a.id,a])));snapshot={...sample,processes:undefined,gpu:undefined,apps,cpu:Math.min(100,apps.reduce((sum,a)=>sum+a.cpu,0)),running:true,error:null};}notify();}catch{}}});
  proc.stderr.on('data',data=>{errors=(errors+data.toString()).slice(-2000);});
  proc.on('error',error=>{if(epoch===generation){snapshot.error=error.message;notify();}});
  proc.on('exit',()=>{fs.rm(ownFolder,{recursive:true,force:true}).catch(()=>{});if(epoch===generation){child=null;snapshot.running=false;snapshot.error=errors||'System monitor stopped.';notify();}});
  notify();return state();
}
function stop(){generation++;child?.kill();child=null;snapshot.running=false;notify();return state();}
async function endApp(id,identities){
  const row=snapshot.apps.find(a=>a.id===id);
  if(!snapshot.running||Date.now()-snapshot.sampledAt>15000||!row?.canEnd)throw new Error('This app cannot be ended safely. Refresh the monitor and try again.');
  if(!Array.isArray(identities)||JSON.stringify(identities)!==JSON.stringify(row.processes))throw new Error('The app’s processes changed. Review the latest app details first.');
  // Only numeric IDs and validated Windows start ticks enter the command; verify identity again in the OS before terminating.
  const pairs=row.processes.map(p=>{if(!Number.isInteger(p.pid)||p.pid<=4||!/^\d{15,20}$/.test(p.start))throw new Error('Invalid process identity');return `${p.pid}='${p.start}'`;}).join(';');
  const code=`$ErrorActionPreference='Stop';$targets=@{${pairs}};$verified=@();foreach($key in $targets.Keys){$p=Get-Process -Id $key -ErrorAction SilentlyContinue;if($p){$null=$p.Handle;if($p.StartTime.ToUniversalTime().Ticks.ToString() -ne $targets[$key]){throw 'Process changed; nothing was ended.'};$verified+=$p}};foreach($p in $verified){if(!$p.HasExited){$p.Kill()}}`;
  await new Promise((resolve,reject)=>execFile(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true,timeout:10000},error=>error?reject(new Error('Windows could not end this app. It may require elevated permission.')):resolve()));
  return true;
}
module.exports={state,start,stop,endApp};
