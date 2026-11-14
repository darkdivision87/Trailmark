const Model=require('../renderer/shortcuts');
function createManager({globalShortcut,preferences,actions,platform=process.platform}) {
  let active=Model.empty(),registered=[],error=null,queue=Promise.resolve();
  function unregister(){for(const item of registered)globalShortcut.unregister(item.key);registered=[];}
  function install(config){
    if(!config.enabled)return;
    for(const action of Model.actions.filter(a=>a.scope==='global')){
      const binding=config.bindings[action.id];if(!binding.enabled)continue;
      const key=Model.electronKey(Model.canonical(binding.accelerator,platform));
      let success=false;
      try{success=globalShortcut.register(key,actions[action.id]);}catch(_){success=false;}
      if(!success)throw new Error('Could not enable '+action.label+' ('+Model.display(binding.accelerator,platform)+'). These keys may already be in use. Choose different keys.');
      registered.push({action:action.id,key});
    }
  }
  function apply(input){
    const next=Model.normalize(input,platform),previous=active;
    if(JSON.stringify(next)===JSON.stringify(active)&&!error)return next;
    unregister();
    try{install(next);active=next;error=null;return next;}
    catch(failure){unregister();try{install(previous);}catch(restoreError){unregister();error=restoreError.message;}active=previous;throw failure;}
  }
  async function start(){await preferences.ready;try{apply(preferences.settings.shortcuts);}catch(failure){error=failure.message;}}
  function saveSettings(input){
    const task=queue.then(async()=>{
      if(input.shortcuts===undefined)return preferences.saveSettings(input);
      const previous=active;
      const candidate=Model.normalize(input.shortcuts,platform);
      apply(candidate);
      try{return await preferences.saveSettings({...input,shortcuts:candidate});}
      catch(failure){try{apply(previous);}catch(_){/* status reports any failed restore */}throw failure;}
    });
    queue=task.catch(()=>{});return task;
  }
  function stop(){unregister();active=Model.empty();error=null;}
  function status(){return {config:structuredClone(active),registered:registered.map(item=>item.action),error};}
  return {start,saveSettings,stop,status};
}
module.exports={createManager};
