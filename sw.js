const CACHE_NAME='escalade-renfo-v2';const SHELL=['/','/index.html','/manifest.json','/icon-192.png','/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.pathname.startsWith('/api/')||e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(cached=>{const net=fetch(e.request).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE_NAME).then(c=>c.put(e.request,cp))}return r}).catch(()=>cached);return cached||net}))});
