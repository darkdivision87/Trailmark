const http=require('http');
const {randomBytes,timingSafeEqual}=require('crypto');
const fs=require('fs').promises,path=require('path'),os=require('os'),{spawn}=require('child_process');
const {app,safeStorage,shell}=require('electron');
let child=null,server=null,token=null,port=null,apps=[],browsers=new Map(),commands=new Map();
let error=null,running=false,starting=null,pairing=null,lastUpdated=null,generation=0;
const pairingFile=path.join(app.getPath('userData'),'trailmark-media-pairing.json');
function notify(){require('./tracker').notify();}
function state(){const tabs=[];for(const [clientId,report] of browsers)if(report.updatedAt>=Date.now()-70000)tabs.push(...report.tabs.map(tab=>({...tab,browser:report.browser,clientId})));return {running,error,apps:structuredClone(apps),tabs,lastUpdated,helperAvailable:!!server?.listening,connectedBrowsers:[...new Set([...browsers.values()].filter(report=>report.updatedAt>=Date.now()-70000).map(report=>report.browser))]};}
async function start(){
 if(running)return state();if(starting)return starting;const run=++generation;
 starting=(async()=>{
  if(process.platform!=='win32')throw new Error('Application audio monitoring currently supports Windows.');
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'trailmark-audio-'));
  const script=path.join(directory,'audio-monitor.ps1');await fs.writeFile(script,await fs.readFile(path.join(__dirname,'audio-monitor.ps1')));
  if(run!==generation){await fs.rm(directory,{recursive:true,force:true});return state();}
  running=true;error=null;
  const helper=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-ParentProcessId',String(process.pid)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  child=helper;let buffer='',stderr='';helper.stdout.setEncoding('utf8');helper.stdout.on('data',data=>{if(run!==generation)return;buffer+=data;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line)continue;try{const report=JSON.parse(line);apps=Array.isArray(report.sources)?report.sources:[];error=report.error||null;lastUpdated=Date.now();notify();}catch(_){}}});
  helper.stderr.setEncoding('utf8');helper.stderr.on('data',data=>{stderr=(stderr+data).slice(-2000);});helper.on('error',failure=>{if(run===generation){error=failure.message;running=false;notify();}});helper.on('exit',code=>{if(child===helper)child=null;if(run===generation&&running){running=false;error='Audio monitor stopped'+(stderr?': '+stderr.trim():` (code ${code})`);notify();}fs.rm(directory,{recursive:true,force:true}).catch(()=>{});});notify();return state();
 })().finally(()=>starting=null);return starting;
}
function stop(){++generation;running=false;child?.kill();child=null;apps=[];lastUpdated=null;commands.clear();notify();}
function authorized(value){const a=Buffer.from(value||''),b=Buffer.from('Bearer '+token);return a.length===b.length&&timingSafeEqual(a,b);}
function requestHandler(req,res){
 const origin=req.headers.origin||'';if(!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)){res.writeHead(403);res.end();return;}
 res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 if(req.method!=='POST'||req.url!=='/tabs'||!authorized(req.headers.authorization)){res.writeHead(403);res.end();return;}
 let body='';req.on('data',data=>{body+=data;if(body.length>65536)req.destroy();});req.on('end',()=>{try{
  const report=JSON.parse(body);if(!['Chrome','Edge'].includes(report.browser)||typeof report.clientId!=='string'||! /^[a-f0-9-]{16,64}$/.test(report.clientId)||!Array.isArray(report.tabs)||report.tabs.length>100)throw new Error('Invalid report');
  const tabs=report.tabs.map(tab=>{if(!Number.isInteger(tab.id)||typeof tab.title!=='string'||typeof tab.url!=='string')throw new Error('Invalid tab');const url=new URL(tab.url);if(!['http:','https:','file:','chrome:','edge:'].includes(url.protocol))throw new Error('Invalid URL');return {id:tab.id,title:tab.title.slice(0,300),url:tab.url.slice(0,2000),muted:tab.muted===true};});
  browsers.set(report.clientId,{browser:report.browser,updatedAt:Date.now(),tabs});const command=commands.get(report.clientId)||null;commands.delete(report.clientId);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({command,monitoring:running}));notify();
 }catch(_){res.writeHead(400);res.end();}});
}
async function pair(){
 if(server?.listening)return {port,token};if(pairing)return pairing;
 pairing=(async()=>{
  await app.whenReady();if(!safeStorage.isEncryptionAvailable())throw new Error('Secure browser pairing is unavailable.');
  let preferred=0;
  try{const saved=JSON.parse(safeStorage.decryptString(Buffer.from(await fs.readFile(pairingFile,'utf8'),'base64')));if(!/^[a-f0-9]{48}$/.test(saved.token)||!Number.isInteger(saved.port)||saved.port<1024||saved.port>65535)throw new Error('Invalid browser pairing file');token=saved.token;preferred=saved.port;}catch(failure){if(failure.code!=='ENOENT')throw failure;token=randomBytes(24).toString('hex');}
  server=http.createServer(requestHandler);await new Promise((resolve,reject)=>{const onError=failure=>{if(failure.code==='EADDRINUSE'&&preferred){preferred=0;server.listen(0,'127.0.0.1');}else reject(failure);};server.on('error',onError);server.listen(preferred,'127.0.0.1',()=>{server.removeListener('error',onError);server.on('error',failure=>{error=failure.message;notify();});resolve();});});
  port=server.address().port;await fs.writeFile(pairingFile,safeStorage.encryptString(JSON.stringify({port,token})).toString('base64'),'utf8');notify();return {port,token};
 })().catch(failure=>{server?.close();server=null;throw failure;}).finally(()=>pairing=null);return pairing;
}
async function initialize(){try{await fs.access(pairingFile);await pair();}catch(failure){if(failure.code!=='ENOENT'){error='Browser helper unavailable: '+failure.message;notify();}}}
function tabAction(browser,id,action,clientId){if(!['focus','mute','unmute'].includes(action))throw new Error('Invalid tab action');if(!state().tabs.some(tab=>tab.browser===browser&&tab.id===id&&tab.clientId===clientId))throw new Error('This tab is no longer reporting audio.');commands.set(clientId,{id,action});return true;}
async function prepareHelper(){const folder=path.join(app.getPath('userData'),'Trailmark Browser Helper');await fs.mkdir(folder,{recursive:true});for(const file of ['manifest.json','background.js','popup.html','popup.js','popup.css','README.md'])await fs.writeFile(path.join(folder,file),await fs.readFile(path.join(__dirname,'../assets/browser-helper',file)));return folder;}
async function openHelper(){const folder=await prepareHelper();const failure=await shell.openPath(folder);if(failure)throw new Error(failure);return folder;}
function shutdown(){stop();server?.closeAllConnections();server?.close();server=null;browsers.clear();}
module.exports={state,start,stop,pair,initialize,tabAction,prepareHelper,openHelper,shutdown};
