/* ============ STORE ============ */
/* IndexedDB-backed storage with in-memory fallback.
   text:     {id, ts, text}
   files:    {id, ts, name, size, type, blob|null}
   settings: {k, v} — GitHub config; token lives only here, on-device
   queue:    {id, day, ts} — days waiting to be sent while offline
   One-time migration from the prototype's localStorage key. */

const DB_NAME='braindump';
const DB_VER=2;
const LEGACY_KEY='pmtco_braindump_proto';

let db=null;
let mem={text:[],files:[],settings:{},queue:[]};   // fallback when IndexedDB is unavailable
let memId=1;

export function dayOf(ts){
  const d=new Date(ts);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
export function today(){return dayOf(Date.now());}

function openDB(){
  return new Promise(function(resolve){
    if(!('indexedDB' in window)){resolve(null);return;}
    let req;
    try{req=indexedDB.open(DB_NAME,DB_VER);}catch(e){resolve(null);return;}
    req.onupgradeneeded=function(){
      const d=req.result;
      if(!d.objectStoreNames.contains('text'))d.createObjectStore('text',{keyPath:'id',autoIncrement:true});
      if(!d.objectStoreNames.contains('files'))d.createObjectStore('files',{keyPath:'id',autoIncrement:true});
      if(!d.objectStoreNames.contains('settings'))d.createObjectStore('settings',{keyPath:'k'});
      if(!d.objectStoreNames.contains('queue'))d.createObjectStore('queue',{keyPath:'id',autoIncrement:true});
    };
    req.onsuccess=function(){resolve(req.result);};
    req.onerror=function(){resolve(null);};
  });
}

function tx(store,mode){
  return db.transaction(store,mode).objectStore(store);
}
function reqP(req){
  return new Promise(function(resolve,reject){
    req.onsuccess=function(){resolve(req.result);};
    req.onerror=function(){reject(req.error);};
  });
}

async function migrateLegacy(){
  let legacy=null;
  try{legacy=JSON.parse(localStorage.getItem(LEGACY_KEY));}catch(e){}
  if(!legacy)return;
  const existing=await all();
  if(!existing.text.length&&!existing.files.length){
    for(const e of (legacy.text||[]))await addText(e);
    for(const f of (legacy.files||[]))await addFile({ts:f.ts,name:f.name,size:f.size,type:f.type,blob:null});
  }
  try{localStorage.removeItem(LEGACY_KEY);}catch(e){}
}

export async function init(){
  db=await openDB();
  await migrateLegacy();
}

export async function addText(entry){
  if(!db){entry.id=memId++;mem.text.push(entry);return;}
  await reqP(tx('text','readwrite').add({ts:entry.ts,text:entry.text}));
}

export async function addFile(f){
  if(!db){f.id=memId++;mem.files.push(f);return;}
  await reqP(tx('files','readwrite').add({ts:f.ts,name:f.name,size:f.size,type:f.type,blob:f.blob||null}));
}

export async function all(){
  if(!db)return {text:mem.text.slice(),files:mem.files.slice()};
  const [text,files]=await Promise.all([
    reqP(tx('text','readonly').getAll()),
    reqP(tx('files','readonly').getAll())
  ]);
  return {text:text,files:files};
}

/* everything captured on one local day */
export async function forDay(day){
  const d=await all();
  return {
    text:d.text.filter(function(e){return dayOf(e.ts)===day;}),
    files:d.files.filter(function(f){return dayOf(f.ts)===day;})
  };
}

/* sorted unique days that have content (always includes today) */
export async function days(){
  const d=await all();
  const s=new Set([today()]);
  d.text.forEach(function(e){s.add(dayOf(e.ts));});
  d.files.forEach(function(f){s.add(dayOf(f.ts));});
  return Array.from(s).sort();
}

/* ---- settings (token, repo, branch, path) ---- */
export async function getSettings(){
  if(!db)return Object.assign({},mem.settings);
  const rows=await reqP(tx('settings','readonly').getAll());
  const out={};rows.forEach(function(r){out[r.k]=r.v;});
  return out;
}
export async function setSettings(obj){
  if(!db){Object.assign(mem.settings,obj);return;}
  const st=tx('settings','readwrite');
  for(const k of Object.keys(obj))st.put({k:k,v:obj[k]});
  await new Promise(function(res,rej){st.transaction.oncomplete=res;st.transaction.onerror=rej;});
}

/* ---- offline send queue ---- */
export async function queueAdd(day){
  const q=await queueAll();
  if(q.some(function(x){return x.day===day;}))return;   // one entry per day
  if(!db){mem.queue.push({id:memId++,day:day,ts:Date.now()});return;}
  await reqP(tx('queue','readwrite').add({day:day,ts:Date.now()}));
}
export async function queueAll(){
  if(!db)return mem.queue.slice();
  return reqP(tx('queue','readonly').getAll());
}
export async function queueRemove(id){
  if(!db){mem.queue=mem.queue.filter(function(x){return x.id!==id;});return;}
  await reqP(tx('queue','readwrite').delete(id));
}

/* ---- mark sent / delete (for dedup + manual cleanup) ---- */
function markSent(storeName,arr,id){
  return new Promise(function(res,rej){
    if(!db){const r=arr.find(function(x){return x.id===id;});if(r)r.sent=Date.now();return res();}
    const t=db.transaction(storeName,'readwrite'),s=t.objectStore(storeName),g=s.get(id);
    g.onsuccess=function(){const rec=g.result;if(rec){rec.sent=Date.now();s.put(rec);}};
    t.oncomplete=function(){res();};t.onerror=function(){rej(t.error);};
  });
}
export function markFileSent(id){return markSent('files',mem.files,id);}
export function markTextSent(id){return markSent('text',mem.text,id);}

export async function deleteFile(id){
  if(!db){mem.files=mem.files.filter(function(x){return x.id!==id;});return;}
  await reqP(tx('files','readwrite').delete(id));
}
export async function deleteText(id){
  if(!db){mem.text=mem.text.filter(function(x){return x.id!==id;});return;}
  await reqP(tx('text','readwrite').delete(id));
}
