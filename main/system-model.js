const protectedNames=new Set(['system','idle','registry','smss','csrss','wininit','services','lsass','winlogon','svchost','dwm','fontdrvhost','explorer','powershell','pwsh','conhost','electron','trailmark']);
function group(sample,previous=new Map(),ownPid=process.pid){
  const groups=new Map();
  for(const p of sample.processes||[]){
    if(!Number.isInteger(p.pid)||p.pid<=0||!Number.isFinite(p.ram))continue;
    const key=(p.path||p.name).toLowerCase();let row=groups.get(key);
    if(!row){row={id:key,name:p.name,cpu:0,ram:0,gpu:sample.gpuAvailable?0:null,processes:[],engines:{},canEnd:true};groups.set(key,row);}
    row.cpu+=Math.max(0,Number(p.cpu)||0);row.ram+=p.ram;
    if(row.gpu!==null){const engines=sample.gpu?.[p.pid]||{};for(const [engine,utilization]of Object.entries(engines))row.engines[engine]=(row.engines[engine]||0)+(Number(utilization)||0);}
    row.processes.push({pid:p.pid,start:String(p.start)});
    if(!p.path||protectedNames.has(String(p.name).toLowerCase())||p.pid===ownPid||/^[a-z]:[\\/]windows[\\/]/i.test(p.path))row.canEnd=false;
  }
  for(const row of groups.values()){
    row.cpu=Math.min(100,row.cpu);if(row.gpu!==null)row.gpu=Math.min(100,Math.max(0,...Object.values(row.engines)));delete row.engines;row.processes.sort((a,b)=>a.pid-b.pid);
    const old=previous.get(row.id);row.spike=!!old&&(row.cpu>=20&&row.cpu-old.cpu>=15||row.ram-old.ram>=256*1024*1024||row.gpu!==null&&old.gpu!==null&&row.gpu>=20&&row.gpu-old.gpu>=15);
    row.history=[...(old?.history||[]),row.cpu].slice(-20);
  }
  return [...groups.values()].sort((a,b)=>b.cpu-a.cpu||b.ram-a.ram);
}
module.exports={group,protectedNames};
