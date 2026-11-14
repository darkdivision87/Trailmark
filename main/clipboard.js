const {app,clipboard,safeStorage,nativeImage}=require('electron');
const path=require('path'),fs=require('fs').promises;
const preferences=require('./preferences');
module.exports=require('./clipboard-history').createHistory({fromPNG:buffer=>nativeImage.createFromBuffer(buffer),clipboard,safeStorage,fs,file:path.join(app.getPath('userData'),'trailmark-clipboard.json'),settings:()=>preferences.settings,whenReady:app.whenReady(),notify:()=>require('./tracker').notify()});
