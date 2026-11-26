const CACHE='wordflow-shell-v1.1.2';
const FILES=['./','./index.html','./cards.js','./wordflow.js','./wordflow.css','./fondo-ciudad.jpg','./manifest.webmanifest','./logo.png','./icon-180.png','./icon-192.png','./icon-512.png','./wordflow-icon-v2-180.png','./wordflow-icon-v2-192.png','./wordflow-icon-v2-48.png','./wordflow-icon-v2-512.png','./wordflow-maskable-v2-192.png','./wordflow-maskable-v2-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(async cache=>{for(const path of FILES){const req=new Request(new URL(path,self.registration.scope),{cache:'reload'});const res=await fetch(req);if(!res.ok)throw Error('Invalid app asset');if(path.endsWith('.js')&&!(res.headers.get('content-type')||'').includes('javascript'))throw Error('Session response instead of app asset');await cache.put(req,res);}})));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('wordflow-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==self.location.origin)return;
 const allowed=new Set(FILES.map(p=>new URL(p,self.registration.scope).pathname));if(!allowed.has(u.pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  if(event.request.mode==='navigate'){
   try{const response=await fetch(event.request);if(response.ok)return response;}catch{}
   const cached=await cache.match(u.pathname);if(cached)return cached;
  }else{
   const cached=await cache.match(u.pathname);if(cached)return cached;
  }
  return fetch(event.request);
 })());
});
