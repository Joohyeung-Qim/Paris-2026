'use strict';
const CACHE='paris-plans-2e56932f9dea';
const FILES=["./", "./index.html", "./styles.css", "./data.js", "./app.js", "./apple-touch-icon.png", "./icon-192.png", "./icon-512.png", "./manifest.webmanifest", "./vendor/leaflet.js", "./vendor/leaflet.css"];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('paris-plans-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 // Never prefetch or cache map tiles or any other third-party resource.
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 const allowed=FILES.some(file=>new URL(file,self.registration.scope).pathname===url.pathname);
 if(!allowed)return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,clone)));}return response;}).catch(async()=>{const cached=await caches.match(event.request,{ignoreSearch:true});if(cached)return cached;if(event.request.mode==='navigate')return caches.match(new URL('./index.html',self.registration.scope).href);return Response.error();}));
});
