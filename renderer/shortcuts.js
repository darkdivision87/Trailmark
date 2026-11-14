(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.TrailmarkShortcuts=api;})(typeof window==='object'?window:globalThis,function(){
  const actions=[
    {id:'toggleTracking',label:'Pause / resume tracking',scope:'global',description:'Works while another application is active.'},
    {id:'showWindow',label:'Show Trailmark',scope:'global',description:'Bring Trailmark back from the system tray.'},
    {id:'search',label:'Search activity',scope:'app',description:'Open the timeline and focus search.'},
    ...['today','tasks','clipboard','media','timeline','projects','insights','settings'].map(view=>({id:view,label:'Open '+view[0].toUpperCase()+view.slice(1),scope:'app',description:'Only while Trailmark is active.'}))
  ];
  const modifiers=['Ctrl','Alt','Shift','Super','CommandOrControl'];
  const aliases={control:'Ctrl',ctrl:'Ctrl',alt:'Alt',option:'Alt',shift:'Shift',cmd:'Super',command:'Super',meta:'Super',super:'Super',commandorcontrol:'CommandOrControl',cmdorctrl:'CommandOrControl'};
  const special=['Space','Tab','Backspace','Delete','Insert','Enter','Up','Down','Left','Right','Home','End','PageUp','PageDown','Escape','Plus','Minus','Comma','Period','Slash'];
  const keyAliases={return:'Enter',esc:'Escape',arrowup:'Up',arrowdown:'Down',arrowleft:'Left',arrowright:'Right',' ':'Space','-':'Minus',',':'Comma','.':'Period','/':'Slash'};
  function empty(){return {enabled:false,bindings:Object.fromEntries(actions.map(a=>[a.id,{enabled:false,accelerator:''}]))};}
  function canonical(value,platform){
    if(typeof value!=='string'||value.length>100)throw new Error('Choose a valid shortcut.');
    const parts=value.split('+').map(x=>x.trim());const raw=parts.pop();
    let key=keyAliases[raw?.toLowerCase()]||special.find(k=>k.toLowerCase()===raw?.toLowerCase())||raw?.toUpperCase();
    if(!key || !(/^[A-Z0-9]$/.test(key)||/^F([1-9]|1[0-9]|2[0-4])$/.test(key)||special.includes(key)))throw new Error('Use a letter, number, function key, or navigation key.');
    const mods=parts.map(p=>aliases[p.toLowerCase()]);
    if(mods.some(m=>!m)||new Set(mods).size!==mods.length)throw new Error('Choose a valid modifier combination.');
    if(!mods.some(m=>m!=='Shift')&&!/^F([1-9]|1[0-9]|2[0-4])$/.test(key))throw new Error('Include Ctrl, Alt, or Command with this key.');
    let resolved=mods;
    if(platform)resolved=mods.map(m=>m==='CommandOrControl'?(platform==='darwin'?'Super':'Ctrl'):m);
    if(new Set(resolved).size!==resolved.length)throw new Error('This shortcut repeats a modifier.');
    return [...modifiers.filter(m=>resolved.includes(m)),key].join('+');
  }
  function normalize(input,platform){
    const result=empty();result.enabled=input?.enabled===true;
    const used=new Map();
    for(const action of actions){const given=input?.bindings?.[action.id];const binding=result.bindings[action.id];binding.enabled=given?.enabled===true;
      if(given?.accelerator)binding.accelerator=canonical(given.accelerator);
      if(result.enabled&&binding.enabled){
        if(!binding.accelerator)throw new Error('Choose keys for '+action.label+'.');
        const signature=canonical(binding.accelerator,platform);if(used.has(signature))throw new Error(action.label+' uses the same keys as '+used.get(signature)+'.');used.set(signature,action.label);
      }
    }
    return result;
  }
  function fromEvent(event){
    if(event.isComposing || ['Control','Alt','Shift','Meta','OS','AltGraph'].includes(event.key))return null;
    const mods=[];if(event.ctrlKey)mods.push('Ctrl');if(event.altKey)mods.push('Alt');if(event.shiftKey)mods.push('Shift');if(event.metaKey)mods.push('Super');
    let key=event.key==='+'?'Plus':event.key;
    if(/^(Key[A-Z]|Digit[0-9])$/.test(event.code||''))key=event.code.replace(/^(Key|Digit)/,'');
    if(event.code==='Space')key='Space';
    try{return canonical([...mods,keyAliases[String(key).toLowerCase()]||key].join('+'));}catch(_){return null;}
  }
  function matches(config,actionId,event,platform){const binding=config?.bindings?.[actionId];if(!config?.enabled||!binding?.enabled||!binding.accelerator||event.repeat||event.isComposing)return false;const key=fromEvent(event);return key!==null && canonical(binding.accelerator,platform)===canonical(key,platform);}
  function display(value,platform){if(!value)return 'Not assigned';return value.replace(/CommandOrControl/g,platform==='darwin'?'Command':'Ctrl').replace(/Super/g,platform==='darwin'?'Command':'Windows').replace(/Minus/g,'−').replace(/Comma/g,',').replace(/Period/g,'.').replace(/Slash/g,'/').replace(/\+/g,' + ');}
  function electronKey(value){return value.replace(/Minus/g,'-').replace(/Comma/g,',').replace(/Period/g,'.').replace(/Slash/g,'/');}
  return {actions,empty,canonical,normalize,fromEvent,matches,display,electronKey};
});
