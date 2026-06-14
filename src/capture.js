/* ============ CAPTURE ============ */
import {brain} from './brain.js';
import * as store from './store.js';
import * as vault from './vault.js';

const mic=document.getElementById('mic'),stateEl=document.getElementById('state'),
    subEl=document.getElementById('sub'),interim=document.getElementById('interim'),
    addBtn=document.getElementById('addBtn'),listBtn=document.getElementById('listBtn'),
    filePick=document.getElementById('filePick'),sheet=document.getElementById('sheet'),
    sheetBody=document.getElementById('sheetBody'),sheetX=document.getElementById('sheetX'),
    toast=document.getElementById('toast'),waveC=document.getElementById('wave'),
    wctx=waveC.getContext('2d'),addNum=document.getElementById('addNum'),
    listNum=document.getElementById('listNum'),
    dayPrev=document.getElementById('dayPrev'),dayNext=document.getElementById('dayNext'),
    dayLabel=document.getElementById('dayLabel'),
    cfg=document.getElementById('cfg'),cfgX=document.getElementById('cfgX'),
    sendBtn=document.getElementById('sendBtn');

let viewDay=store.today();   // day shown in the sheet; capture always goes to today

async function counts(){
  const d=await store.forDay(store.today());
  addNum.textContent=d.files.length;addNum.classList.toggle('on',d.files.length>0);
  listNum.textContent=d.text.length;listNum.classList.toggle('on',d.text.length>0);
  const q=await store.queueAll();
  sendBtn.textContent=q.length?'Send to vault ('+q.length+' queued)':'Send to vault';
}
function say(msg){toast.textContent=msg;toast.classList.add('show');
  clearTimeout(say.t);say.t=setTimeout(function(){toast.classList.remove('show');},1700);}

/* wake lock — keep the screen on during long captures */
let wakeLock=null;
async function acquireWakeLock(){
  if(!('wakeLock' in navigator))return;
  try{
    wakeLock=await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release',function(){wakeLock=null;});
  }catch(e){wakeLock=null;}
}
function releaseWakeLock(){
  if(wakeLock){wakeLock.release().catch(function(){});wakeLock=null;}
}
document.addEventListener('visibilitychange',function(){
  if(listening&&document.visibilityState==='visible'&&!wakeLock)acquireWakeLock();
});

/* audio + thin symmetric waveform like reference */
var actx,analyser,stream,fdata,tdata,raf;
function startAudio(){
  if(!navigator.mediaDevices) return;
  navigator.mediaDevices.getUserMedia({audio:true}).then(function(s){
    stream=s;var AC=window.AudioContext||window.webkitAudioContext;actx=new AC();
    var src=actx.createMediaStreamSource(s);
    analyser=actx.createAnalyser();analyser.fftSize=512;src.connect(analyser);
    fdata=new Uint8Array(analyser.frequencyBinCount);
    tdata=new Uint8Array(analyser.fftSize);
    meter();
  }).catch(function(){});
}
function meter(){
  if(!analyser)return;
  analyser.getByteTimeDomainData(tdata);
  var sum=0;for(var i=0;i<tdata.length;i++){var v=(tdata[i]-128)/128;sum+=v*v;}
  brain.amp=Math.min(Math.sqrt(sum/tdata.length)*3.4,1);
  analyser.getByteFrequencyData(fdata);
  drawWave();
  raf=requestAnimationFrame(meter);
}
function drawWave(){
  var w=waveC.width,h=waveC.height,mid=h/2,N=110;
  wctx.clearRect(0,0,w,h);
  for(var i=0;i<N;i++){
    var t=i/(N-1);
    var bin=4+((t*60)|0);
    var amp=(fdata[bin]||0)/255;
    var edge=Math.sin(t*Math.PI);                 // fade toward both ends
    var bh=Math.max(1,amp*mid*0.92*edge);
    var x=t*w;
    var al=0.15+amp*0.85*edge;
    wctx.strokeStyle='rgba(190,222,255,'+al.toFixed(2)+')';
    wctx.lineWidth=2;
    wctx.beginPath();wctx.moveTo(x,mid-bh);wctx.lineTo(x,mid+bh);wctx.stroke();
  }
}
function stopAudio(){
  if(raf)cancelAnimationFrame(raf);
  brain.amp=0;
  if(stream){stream.getTracks().forEach(function(t){t.stop();});stream=null;}
  if(actx){try{actx.close();}catch(e){}actx=null;}
  analyser=null;wctx.clearRect(0,0,waveC.width,waveC.height);
}

var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
var rec=null,listening=false,finalBuf='',meeting=false,meetT0=0,meetTimer=null;
function elapsed(){
  var s=((Date.now()-meetT0)/1000)|0;
  return String((s/60)|0).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
}
function start(asMeeting){
  finalBuf='';interim.textContent='';
  meeting=!!asMeeting;
  brain.active=true;
  document.body.classList.add('rec');
  stateEl.textContent='Listening…';
  if(meeting){
    meetT0=Date.now();
    subEl.textContent='meeting capture · 00:00';
    meetTimer=setInterval(function(){subEl.textContent='meeting capture · '+elapsed();},1000);
  } else {
    subEl.textContent='Tap to interrupt';
  }
  startAudio();
  acquireWakeLock();
  if(SR){
    rec=new SR();rec.lang=navigator.language||'en-US';
    rec.continuous=true;rec.interimResults=true;
    rec.onresult=function(ev){
      var it='';
      for(var i=ev.resultIndex;i<ev.results.length;i++){
        if(ev.results[i].isFinal)finalBuf+=ev.results[i][0].transcript+' ';
        else it+=ev.results[i][0].transcript;
      }
      interim.textContent=(finalBuf+it).trim();
    };
    rec.onerror=function(ev){if(ev.error==='not-allowed'){say('mic blocked');stop(true);}};
    rec.onend=function(){if(listening)try{rec.start();}catch(e){}};
    try{rec.start();}catch(e){}
  } else {subEl.textContent=meeting?'meeting capture · audio only':'audio only — no transcript engine';}
  listening=true;
}
async function stop(silent){
  listening=false;brain.active=false;
  document.body.classList.remove('rec');
  if(meetTimer){clearInterval(meetTimer);meetTimer=null;}
  meeting=false;
  if(rec){try{rec.onend=null;rec.stop();}catch(e){}rec=null;}
  stopAudio();
  releaseWakeLock();
  stateEl.textContent='Tap to speak';subEl.textContent='everything stays on this device';
  var said=(finalBuf||interim.textContent||'').trim();
  interim.textContent='';
  if(!silent&&said){await store.addText({ts:Date.now(),text:said});await counts();say('absorbed ✓');}
  else if(!silent&&!said){say('nothing caught');}
}

/* tap = normal capture; long-press (550ms) = meeting mode with elapsed timer */
var pressTimer=null,longFired=false;
mic.addEventListener('pointerdown',function(){
  if(listening)return;
  longFired=false;
  pressTimer=setTimeout(function(){longFired=true;start(true);},550);
});
mic.addEventListener('pointerup',function(){clearTimeout(pressTimer);});
mic.addEventListener('pointerleave',function(){clearTimeout(pressTimer);});
mic.addEventListener('click',function(){
  if(longFired){longFired=false;return;}     // the click that follows a long-press
  listening?stop():start(false);
});

addBtn.addEventListener('click',function(){filePick.click();});
filePick.addEventListener('change',async function(){
  var n=filePick.files.length;
  for(const f of Array.from(filePick.files)){
    await store.addFile({ts:Date.now(),name:f.name,size:f.size,type:f.type,blob:f});
  }
  await counts();filePick.value='';
  say(n+' file'+(n>1?'s':'')+' staged');
});

function fmt(ts){return new Date(ts).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});}
function kb(b){return b<1024?b+' B':b<1048576?(b/1024).toFixed(0)+' KB':(b/1048576).toFixed(1)+' MB';}
var thumbURLs=[];
async function renderSheet(){
  var dayList=await store.days();
  var i=dayList.indexOf(viewDay);if(i<0){viewDay=store.today();i=dayList.indexOf(viewDay);}
  dayLabel.textContent=viewDay===store.today()?'Today’s dump':viewDay;
  dayPrev.classList.toggle('off',i<=0);
  dayNext.classList.toggle('off',i>=dayList.length-1);

  var d=await store.forDay(viewDay);sheetBody.innerHTML='';
  thumbURLs.forEach(function(u){URL.revokeObjectURL(u);});thumbURLs=[];
  var all=d.text.map(function(x){return{k:'text',x:x};})
    .concat(d.files.map(function(x){return{k:'file',x:x};}))
    .sort(function(a,b){return b.x.ts-a.x.ts;});
  if(!all.length){
    sheetBody.innerHTML='<div class="empty">Nothing dumped yet today.<br>Tap the mic, or + to stage a screenshot.</div>';
  } else {
    all.forEach(function(o){
      var el=document.createElement('div');
      if(o.k==='text'){
        el.className='item';
        el.innerHTML='<div class="meta"><span>VOICE</span><span>'+fmt(o.x.ts)+'</span></div><div class="body"></div>';
        el.querySelector('.body').textContent=o.x.text;
      } else {
        var thumb='';
        if(o.x.blob&&(o.x.type||'').indexOf('image')===0){
          thumb=URL.createObjectURL(o.x.blob);thumbURLs.push(thumb);
        }
        el.className='item file';
        el.innerHTML=(thumb?'<img src="'+thumb+'">':'<img>')+
          '<div><div class="fz"></div><div class="meta" style="margin:2px 0 0"><span>'+
          (o.x.type||'file').toUpperCase()+'</span><span style="margin-left:8px">'+kb(o.x.size)+'</span></div></div>';
        el.querySelector('.fz').textContent=o.x.name;
      }
      sheetBody.appendChild(el);
    });
  }
}
async function stepDay(dir){
  var dayList=await store.days();
  var i=dayList.indexOf(viewDay)+dir;
  if(i<0||i>=dayList.length)return;
  viewDay=dayList[i];
  renderSheet();
}
dayPrev.addEventListener('click',function(){stepDay(-1);});
dayNext.addEventListener('click',function(){stepDay(1);});
listBtn.addEventListener('click',function(){viewDay=store.today();renderSheet().then(function(){sheet.classList.add('open');});});
sheetX.addEventListener('click',function(){sheet.classList.remove('open');});

document.getElementById('exportBtn').addEventListener('click',async function(){
  var d=await store.forDay(viewDay);
  if(!d.text.length&&!d.files.length){say('nothing to export');return;}
  var blob=new Blob([vault.buildMd(viewDay,d)],{type:'text/markdown'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=viewDay+'-braindump.md';
  document.body.appendChild(a);a.click();a.remove();
  say('exported — drop in raw/');
});

/* ---- settings ---- */
async function openCfg(){
  var s=await store.getSettings();
  document.getElementById('cfgWebhook').value=s.webhook||'https://antony87.app.n8n.cloud/webhook/braindump-intake';
  document.getElementById('cfgWebhookKey').value=s.webhookKey||'';
  document.getElementById('cfgToken').value=s.token||'';
  document.getElementById('cfgRepo').value=s.repo||'';
  document.getElementById('cfgBranch').value=s.branch||'';
  document.getElementById('cfgPath').value=s.path||'';
  cfg.classList.add('open');
}
document.getElementById('dotsBtn').addEventListener('click',openCfg);
cfgX.addEventListener('click',function(){cfg.classList.remove('open');});
document.getElementById('cfgSave').addEventListener('click',async function(){
  await store.setSettings({
    webhook:document.getElementById('cfgWebhook').value.trim(),
    webhookKey:document.getElementById('cfgWebhookKey').value.trim(),
    token:document.getElementById('cfgToken').value.trim(),
    repo:document.getElementById('cfgRepo').value.trim(),
    branch:document.getElementById('cfgBranch').value.trim()||'main',
    path:document.getElementById('cfgPath').value.trim()||'raw/inbox'
  });
  cfg.classList.remove('open');
  say('settings saved');
});

/* ---- send to vault ---- */
function pulse(){
  brain.pulseT=performance.now();
  document.body.classList.add('sync');
  setTimeout(function(){document.body.classList.remove('sync');},1200);
}
async function trySend(day,fromQueue){
  try{
    await vault.sendDay(day,function(i,total){if(total>1)say('sending '+i+'/'+total+'…');});
    return true;
  }catch(e){
    if(e.message==='settings-missing'){say('set up vault sync first');openCfg();}
    else if(e.message==='nothing to send'){if(!fromQueue)say('nothing to send');return true;}
    else if(vault.offlineError(e)){
      await store.queueAdd(day);
      if(!fromQueue)say('offline — queued');
    }
    else say(e.message);
    return false;
  }
}
sendBtn.addEventListener('click',async function(){
  sendBtn.disabled=true;say('sending…');
  var ok=await trySend(viewDay,false);
  if(ok){pulse();say('synced to vault ✓');}
  await counts();
  sendBtn.disabled=false;
});
async function flushQueue(){
  var q=await store.queueAll();
  if(!q.length)return;
  var sent=0;
  for(const item of q){
    if(await trySend(item.day,true)){await store.queueRemove(item.id);sent++;}
  }
  if(sent){pulse();say('queued dump'+(sent>1?'s':'')+' synced ✓');}
  await counts();
}
window.addEventListener('online',flushQueue);

document.getElementById('menuBtn').addEventListener('click',function(){say('menu — coming soon');});

store.init().then(function(){counts();flushQueue();});
