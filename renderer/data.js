(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.TrailmarkData=api;})(typeof window==='object'?window:globalThis,function(){
  const friendly = {chrome:'Google Chrome',msedge:'Microsoft Edge',code:'Visual Studio Code',explorer:'File Explorer',trailmark:'Trailmark',electron:'Trailmark',notepad:'Notepad',windowsterminal:'Windows Terminal',powershell:'PowerShell',spotify:'Spotify',slack:'Slack',figma:'Figma',obs64:'OBS Studio',ableton:'Ableton Live'};
  function appName(entry){const name=entry.window?.appName || entry.window?.path?.split(/[\\/]/).pop()?.replace(/\.exe$/i,'') || entry.window?.title?.split(' - ').pop() || 'Application';return friendly[name.toLowerCase()] || name;}
  function appKey(entry){return appName(entry).toLowerCase();}
  function dateKey(date){const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function bounds(date){const start=new Date(date+'T00:00:00');const end=new Date(start);end.setDate(end.getDate()+1);return [start.getTime(),end.getTime()];}
  function projectFor(entry,projects){
    if(Object.prototype.hasOwnProperty.call(entry,'projectId') && entry.projectId !== undefined && entry.projectId !== null) return projects.find(p=>p.id===entry.projectId) || null;
    const text=(appName(entry)+' '+(entry.window?.title || '')).toLowerCase();
    return projects.find(p=>p.keywords.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).some(word=>text.includes(word))) || null;
  }
  function clip(entries,start,end){return entries.map(e=>{const a=Math.max(e.timestamp,start);const b=Math.min(e.timestamp+Math.max(0,Number(e.duration)||0)*1000,end);return {...e,timestamp:a,duration:Math.max(0,b-a)/1000};}).filter(e=>e.duration>0);}
  function summary(entries,start,end,projects=[]){
    const sessions=clip(entries,start,end).sort((a,b)=>a.timestamp-b.timestamp);
    const groups=new Map();const hours=Array(24).fill(0);let switches=0,previous=null;
    for(const e of sessions){const name=appName(e),key=appKey(e);if(previous && previous!==key)switches++;previous=key;
      if(!groups.has(key))groups.set(key,{key,name,duration:0,count:0});const group=groups.get(key);group.duration+=e.duration;group.count++;
      let cursor=e.timestamp,stop=e.timestamp+e.duration*1000;
      while(cursor<stop){const date=new Date(cursor);const next=new Date(date);next.setHours(date.getHours()+1,0,0,0);const segment=Math.min(stop,next.getTime());if(segment<=cursor)break;hours[date.getHours()]+=(segment-cursor)/1000;cursor=segment;}
    }
    const total=sessions.reduce((n,e)=>n+e.duration,0);
    const longest=sessions.reduce((n,e)=>Math.max(n,e.duration),0);
    const projectsTotal=projects.map(p=>({...p,duration:sessions.filter(e=>projectFor(e,projects)?.id===p.id).reduce((n,e)=>n+e.duration,0)}));
    return {sessions,total,longest,switches,hours,apps:[...groups.values()].sort((a,b)=>b.duration-a.duration),projects:projectsTotal};
  }
  function filter(entries,filters,projects){const [start]=bounds(filters.start);const [,end]=bounds(filters.end);return clip(entries,start,end).filter(e=>{
    const text=(appName(e)+' '+(e.window?.title||'')).toLowerCase();const project=projectFor(e,projects);
    return (!filters.query || text.includes(filters.query.toLowerCase())) && (!filters.app || appKey(e)===filters.app) && (!filters.project || (filters.project==='unassigned'? !project : project?.id===filters.project));
  }).sort((a,b)=>b.timestamp-a.timestamp);}
  return {appName,appKey,dateKey,bounds,projectFor,clip,summary,filter};
});
