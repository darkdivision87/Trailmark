let interval=null,reporting=false;
async function report(){
 if(reporting)return;reporting=true;
 try{
  const stored=await chrome.storage.local.get(['pairing','clientId']);const pairing=stored.pairing;let clientId=stored.clientId;if(!clientId){clientId=crypto.randomUUID();await chrome.storage.local.set({clientId});}if(!pairing){clearInterval(interval);interval=null;return {error:'Pair with Trailmark first.'};}
  const tabs=await chrome.tabs.query({audible:true});const browser=/Edg\//.test(navigator.userAgent)?'Edge':'Chrome';
  const response=await fetch(`http://127.0.0.1:${pairing.port}/tabs`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+pairing.token},body:JSON.stringify({browser,clientId,tabs:tabs.filter(tab=>tab.url).slice(0,50).map(tab=>({id:tab.id,title:(tab.title||'Browser tab').slice(0,150),url:(tab.url||'').slice(0,900),muted:tab.mutedInfo?.muted===true}))}),signal:AbortSignal.timeout(4000)});
  if(!response.ok)throw new Error('Pairing was not accepted. Copy a fresh pairing code from Trailmark.');
  const {command,monitoring}=await response.json();
  if(command){const tab=await chrome.tabs.get(command.id);if(command.action==='focus'){await chrome.tabs.update(tab.id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});}else await chrome.tabs.update(tab.id,{muted:command.action==='mute'});}
  if(monitoring&&!interval)interval=setInterval(report,2000);if(!monitoring){clearInterval(interval);interval=null;}
  await chrome.storage.session.set({status:{connected:true,count:tabs.length,updatedAt:Date.now(),error:null}});return {connected:true,count:tabs.length};
 }catch(error){clearInterval(interval);interval=null;await chrome.storage.session.set({status:{connected:false,error:error.message,updatedAt:Date.now()}});return {error:error.message};}
 finally{reporting=false;}
}
chrome.tabs.onUpdated.addListener((_id,change)=>{if('audible'in change||'mutedInfo'in change||'title'in change||'url'in change)report();});chrome.tabs.onRemoved.addListener(report);chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='trailmark-heartbeat')report();});
chrome.runtime.onInstalled.addListener(()=>chrome.alarms.create('trailmark-heartbeat',{periodInMinutes:.5}));chrome.runtime.onStartup.addListener(()=>{chrome.alarms.create('trailmark-heartbeat',{periodInMinutes:.5});report();});
chrome.runtime.onMessage.addListener((message,_sender,respond)=>{if(message.type==='report'){report().then(respond);return true;}if(message.type==='disconnect'){clearInterval(interval);interval=null;chrome.storage.local.remove('pairing').then(()=>respond({disconnected:true}));return true;}});
chrome.alarms.get('trailmark-heartbeat').then(alarm=>{if(!alarm)chrome.alarms.create('trailmark-heartbeat',{periodInMinutes:.5});});report();
