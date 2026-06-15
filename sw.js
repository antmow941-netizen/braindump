/* Cache-first app shell so the PWA launches offline. Bump CACHE on any shell change. */
const CACHE='braindump-v6';
const SHELL=[
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icon.svg',
  './src/brain.js',
  './src/capture.js',
  './src/store.js',
  './src/vault.js'
];

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(SHELL);}).then(function(){return self.skipWaiting();}));
});

self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}));
});

self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  e.respondWith(
    caches.match(e.request).then(function(hit){
      if(hit)return hit;
      return fetch(e.request).then(function(res){
        // runtime-cache CDN deps (three.js, fonts) so offline launch keeps working
        var url=e.request.url;
        if(res.ok&&(url.indexOf('cdnjs.cloudflare.com')>-1||url.indexOf('fonts.googleapis.com')>-1||url.indexOf('fonts.gstatic.com')>-1)){
          var copy=res.clone();
          caches.open(CACHE).then(function(c){c.put(e.request,copy);});
        }
        return res;
      });
    })
  );
});
