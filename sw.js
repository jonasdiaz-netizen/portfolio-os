const CACHE_PREFIX = "portfolio-os-shell-";
const CACHE = `${CACHE_PREFIX}v25-long-term-dividend-growth`;
const ASSETS = [
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];
const ASSET_URLS = new Set(ASSETS.map(asset => new URL(asset, self.location.href).href));

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys
        .filter(key=>key.startsWith(CACHE_PREFIX)&&key!==CACHE)
        .map(key=>caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch",event=>{
  const {request}=event;
  if(request.method!=="GET")return;

  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  if(request.mode==="navigate"){
    event.respondWith(fetch(request).catch(()=>caches.match("./index.html")));
    return;
  }

  if(!ASSET_URLS.has(url.href))return;
  event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));
});
