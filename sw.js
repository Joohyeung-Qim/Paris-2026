'use strict';
const CACHE='paris-plans-f9f514a00b1d';
const FILES=["./", "./index.html", "./styles.css?v=2cd6f046e073", "./data.js?v=b601a86be638", "./app.js?v=1a38aa767e04", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png", "./manifest.webmanifest?v=5d0f6e61c9e0", "./vendor/leaflet.js", "./vendor/leaflet.css", "./vendor/PretendardVariable.woff2"];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(file=>new Request(file,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('paris-plans-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 // Never prefetch or cache map tiles or any other third-party resource.
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 const allowed=FILES.some(file=>new URL(file,self.registration.scope).pathname===url.pathname);
 if(!allowed)return;
 event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,clone)));}return response;}).catch(async()=>{const cached=await caches.match(event.request,{ignoreSearch:true});if(cached)return cached;if(event.request.mode==='navigate')return caches.match(new URL('./index.html',self.registration.scope).href);return Response.error();}));
});
