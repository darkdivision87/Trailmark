const {randomUUID,createHash}=require('crypto');

// Separate from activity data: only the clipboard view receives clipboard contents.
function createHistory({clipboard,safeStorage,fs,file,settings,fromPNG,notify=()=>{},whenReady=Promise.resolve(),now=Date.now,uuid=randomUUID,maxItems=5000}) {
  let revision=0,items=[],error=null,timer=null,lastText=null,polling=false,loaded=false;
  const ready=whenReady.then(async()=>{
    try {
      const saved=JSON.parse(await fs.readFile(file,'utf8'));
      if(saved.version!==1||typeof saved.encrypted!=='string')throw new Error('Unsupported clipboard history format.');
      if(!safeStorage.isEncryptionAvailable())throw new Error('Encrypted clipboard storage is unavailable.');
      const value=JSON.parse(safeStorage.decryptString(Buffer.from(saved.encrypted,'base64')));
      if(!Array.isArray(value)||value.some(item=>typeof item.id!=='string'||typeof item.text!=='string'||!Number.isFinite(item.lastCopiedAt)))throw new Error('Invalid clipboard history.');
      items=value;loaded=true;
    }catch(failure){if(failure.code==='ENOENT')loaded=true;else error='Could not open clipboard history: '+failure.message;}
  });
  let queue=ready;
  function prune(list){const days=Number(settings().clipboardDays??90),cutoff=now()-days*86400000;return list.filter(item=>item.pinned||days===0||item.lastCopiedAt>=cutoff).sort((a,b)=>b.lastCopiedAt-a.lastCopiedAt).slice(0,maxItems);}
  function update(change){const task=queue.then(async()=>{
    if(!loaded)throw new Error(error||'Clipboard history is unavailable.');
    if(!safeStorage.isEncryptionAvailable())throw new Error('Encrypted clipboard storage is unavailable.');
    const next=prune(change(structuredClone(items)));
    let bytes=next.reduce((n,i)=>n+(i.png?.length||0),0);for(let i=next.length-1;bytes>64*1024*1024&&i>=0;i--)if(next[i].png&&!next[i].pinned){bytes-=next[i].png.length;next.splice(i,1);}if(bytes>64*1024*1024)throw new Error('Image history is full. Unpin or delete older images.');
    const saved=JSON.stringify({version:1,encrypted:safeStorage.encryptString(JSON.stringify(next)).toString('base64')});
    await fs.writeFile(file+'.tmp',saved,'utf8');
    for(let attempt=0;;attempt++){try{await fs.rename(file+'.tmp',file);break;}catch(failure){if(!['EPERM','EACCES','EBUSY'].includes(failure.code)||attempt===5)throw failure;await new Promise(resolve=>setTimeout(resolve,(attempt+1)*30));}}
    items=next;error=null;++revision;notify();return status();
  });queue=task.catch(()=>{});return task;}
  function status(){return {enabled:settings().clipboardEnabled===true,running:!!timer,error,revision,count:items.length};}
  async function get(){await queue;if(loaded&&prune(items).length!==items.length)await update(list=>list);return {...status(),items:items.map(({png,...item})=>structuredClone(item))};}
  async function image(id){await queue;const item=items.find(i=>i.id===id&&i.type==='image');if(!item)throw new Error('This image no longer exists.');return 'data:image/png;base64,'+item.png;}
  function key(value){return value&&typeof value==='object'?'image:'+value.hash:value;}
  function read(){const formats=clipboard.availableFormats();if(formats.some(format=>/concealed|password|clipboard viewer ignore|excludeclipboardcontentfrommonitorprocessing/i.test(format)))return null;if(formats.some(f=>/image|png|bitmap|dib|tiff/i.test(f))&&clipboard.readImage){const image=clipboard.readImage();if(!image.isEmpty()){const size=image.getSize();if(size.width*size.height>24000000)throw new Error('Image is too large. Use an image below 24 megapixels.');const png=image.toPNG();if(png.length>8*1024*1024)throw new Error('Image is too large. Use an image below 8 MB.');return {type:'image',text:'',png:png.toString('base64'),preview:image.resize(size.height>size.width?{height:Math.min(size.height,200)}:{width:Math.min(size.width,280)}).toDataURL(),width:size.width,height:size.height,hash:createHash('sha256').update(String(size.width)+'x'+String(size.height)).update(image.toBitmap?image.toBitmap():png).digest('hex')};}}const text=clipboard.readText();return typeof text==='string'?text:null;}
  async function capture(content){if(content===null||content===undefined||typeof content==='string'&&!content.trim())return false;const image=typeof content==='object';if(!image&&content.length>50000)throw new Error('This clip is too large. Save text of up to 50,000 characters.');await update(list=>{const existing=list.find(item=>image?item.type==='image'&&item.hash===content.hash:item.type!=='image'&&item.text===content);if(existing){existing.lastCopiedAt=now();existing.archivedAt=null;existing.copies=(existing.copies||1)+1;}else list.unshift({id:uuid(),...(image?content:{type:'text',text:content}),createdAt:now(),lastCopiedAt:now(),copies:1,pinned:false,archivedAt:null});return list;});return true;}
  async function poll(){if(polling||!settings().clipboardEnabled)return;polling=true;try{const text=read();if(key(text)!==lastText){lastText=key(text);await capture(text);}}catch(failure){error=failure.message;notify();}finally{polling=false;}}
  function stop(){clearInterval(timer);timer=null;}
  async function configure(){await ready;stop();if(loaded&&prune(items).length!==items.length)await update(list=>list);if(!loaded||!settings().clipboardEnabled){notify();return status();}if(!safeStorage.isEncryptionAvailable())throw new Error('Encrypted clipboard storage is unavailable.');await update(list=>list);lastText=key(read());timer=setInterval(poll,750);timer.unref?.();notify();return status();}
  async function saveCurrent(){await ready;const text=read();if(text===null)throw new Error('This clipboard content is marked private and was not saved.');if(typeof text==='string'&&!text.trim())throw new Error('There is no text or image on the clipboard.');await capture(text);lastText=key(text);return status();}
  async function copy(id){await queue;const item=items.find(item=>item.id===id);if(!item)throw new Error('This clip no longer exists.');if(item.type==='image'){if(!fromPNG)throw new Error('Image recall is unavailable.');lastText='image:'+item.hash;clipboard.writeImage(fromPNG(Buffer.from(item.png,'base64')));}else{lastText=item.text;clipboard.writeText(item.text);}return true;}
  const pin=(id,pinned)=>update(list=>{const item=list.find(item=>item.id===id);if(!item)throw new Error('This clip no longer exists.');item.pinned=pinned===true;return list;});
  const remove=id=>update(list=>list.filter(item=>item.id!==id));
  const clearRecent=()=>update(list=>list.map(item=>({...item,archivedAt:item.archivedAt||now()})));
  async function deleteAll(){stop();await ready;const task=queue.then(async()=>{await fs.rm(file,{force:true});await fs.rm(file+'.tmp',{force:true});items=[];loaded=true;error=null;++revision;lastText=key(read());notify();});queue=task.catch(()=>{});try{await task;}finally{if(settings().clipboardEnabled){timer=setInterval(poll,750);timer.unref?.();}}return status();}
  return {ready,get,image,status,configure,stop,poll,saveCurrent,copy,pin,remove,clearRecent,deleteAll,ignoreText:text=>lastText=text,flush:()=>queue};
}
module.exports={createHistory};
