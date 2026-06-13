/* ============ VAULT TRANSPORT ============ */
/* Commits a day's dump to a GitHub repo via the contents API.
   The only network calls in the app, all user-initiated.
   Never log or echo the token. */

import * as store from './store.js';

function authHeaders(cfg){
  return {
    'Authorization':'Bearer '+cfg.token,
    'Accept':'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28'
  };
}
function apiUrl(cfg,path){
  return 'https://api.github.com/repos/'+cfg.repo+'/contents/'+
    path.split('/').map(encodeURIComponent).join('/');
}

function blobToB64(blob){
  return new Promise(function(res,rej){
    const r=new FileReader();
    r.onload=function(){res(String(r.result).split(',')[1]);};
    r.onerror=function(){rej(r.error);};
    r.readAsDataURL(blob);
  });
}
function textToB64(str){
  return btoa(unescape(encodeURIComponent(str)));
}

export function offlineError(e){
  return (typeof navigator!=='undefined'&&navigator.onLine===false)||
         (e instanceof TypeError);   // fetch network failure
}

async function getSha(cfg,path){
  const r=await fetch(apiUrl(cfg,path)+'?ref='+encodeURIComponent(cfg.branch),
    {headers:authHeaders(cfg)});
  if(r.status===200){const j=await r.json();return j.sha;}
  if(r.status===401)throw new Error('GitHub rejected the token — check settings');
  return null;   // 404 = new file
}

async function putFile(cfg,path,contentB64,message){
  async function attempt(sha){
    const body={message:message,content:contentB64,branch:cfg.branch};
    if(sha)body.sha=sha;
    return fetch(apiUrl(cfg,path),{method:'PUT',headers:authHeaders(cfg),
      body:JSON.stringify(body)});
  }
  let r=await attempt(await getSha(cfg,path));
  if(r.status===409||r.status===422){          // sha conflict — refetch and retry once
    r=await attempt(await getSha(cfg,path));
  }
  if(r.status===401)throw new Error('GitHub rejected the token — check settings');
  if(!r.ok)throw new Error('GitHub error '+r.status+' on '+path);
}

function kb(b){return b<1024?b+' B':b<1048576?(b/1024).toFixed(0)+' KB':(b/1048576).toFixed(1)+' MB';}
function safeName(n){return String(n).replace(/[^A-Za-z0-9._-]/g,'_');}

/* markdown for one day; image attachments referenced by relative link */
export function buildMd(day,d){
  const lines=['# Braindump — '+day,'',
    '> Captured '+new Date().toLocaleString()+' · '+d.text.length+' voice / '+d.files.length+' files','','---',''];
  d.text.slice().sort(function(a,b){return a.ts-b.ts;}).forEach(function(e){
    lines.push('## '+new Date(e.ts).toLocaleTimeString(),'',e.text,'');
  });
  if(d.files.length){
    lines.push('---','','## Attachments','');
    d.files.forEach(function(f){
      if(f.blob&&(f.type||'').indexOf('image')===0){
        lines.push('![' +f.name+'](assets/'+day+'-'+safeName(f.name)+')');
      } else {
        lines.push('- '+f.name+' ('+kb(f.size)+')'+(f.blob?'':' — staged before blob storage, re-add to upload'));
      }
      lines.push('');
    });
  }
  return lines.join('\n');
}

/* send one day's dump.
   Preferred: POST to the n8n intake webhook (key in body; n8n commits to the
   repo with its own GitHub credential — no token on this device).
   Fallback: direct GitHub contents API when a token+repo are configured. */
export async function sendDay(day){
  const cfg=await store.getSettings();
  const d=await store.forDay(day);
  if(!d.text.length&&!d.files.length)throw new Error('nothing to send');

  if(cfg.webhook){
    const files=[];
    for(const f of d.files){
      if(!f.blob)continue;
      files.push({name:f.name,type:f.type,b64:await blobToB64(f.blob)});
    }
    const r=await fetch(cfg.webhook,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key:cfg.webhookKey||'',day:day,md:buildMd(day,d),files:files})
    });
    if(r.status===401)throw new Error('webhook rejected the key — check settings');
    const j=await r.json().catch(function(){return null;});
    if(!r.ok||!j||j.ok!==true)throw new Error((j&&j.error)||'webhook error '+r.status);
    return;
  }

  if(!cfg.token||!cfg.repo)throw new Error('settings-missing');
  cfg.branch=cfg.branch||'main';
  cfg.path=(cfg.path||'raw/inbox').replace(/^\/+|\/+$/g,'');

  const msg='braindump '+day;
  for(const f of d.files){
    if(!f.blob)continue;
    await putFile(cfg,cfg.path+'/assets/'+day+'-'+safeName(f.name),await blobToB64(f.blob),msg);
  }
  await putFile(cfg,cfg.path+'/'+day+'-braindump.md',textToB64(buildMd(day,d)),msg);
}
