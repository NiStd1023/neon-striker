// Cache each release as a complete set. Existing tabs keep their current
// release until they close, so game code and artwork stay in sync.
const CACHE = 'neon-striker-pwa-v1';
const PREFIX = 'neon-striker-pwa-';
const ASSETS = [
  "./",
  "./app.js",
  "./assets/FONT-LICENSE.txt",
  "./assets/apple-touch-icon.png",
  "./assets/boss1.png",
  "./assets/boss2.png",
  "./assets/boss3.png",
  "./assets/brute.png",
  "./assets/cabin-tc-bold.woff",
  "./assets/cabin-tc.woff",
  "./assets/cityline.png",
  "./assets/cover.webp",
  "./assets/favicon.png",
  "./assets/i-bolt.png",
  "./assets/i-cup.png",
  "./assets/i-full.png",
  "./assets/i-heart.png",
  "./assets/i-key.png",
  "./assets/i-mute.png",
  "./assets/i-pad.png",
  "./assets/i-pause.png",
  "./assets/i-pilot.png",
  "./assets/i-play.png",
  "./assets/i-pulse.png",
  "./assets/i-ship.png",
  "./assets/i-sound.png",
  "./assets/i-target.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
  "./assets/kite.png",
  "./assets/music/cues.js",
  "./assets/music/harbor-boss.mp3",
  "./assets/music/harbor-flight.mp3",
  "./assets/music/keep-boss.mp3",
  "./assets/music/keep-flight.mp3",
  "./assets/music/rift-boss.mp3",
  "./assets/music/rift-flight.mp3",
  "./assets/pulse-grid.woff",
  "./assets/stage1.webp",
  "./assets/stage2.webp",
  "./assets/stage3.webp",
  "./assets/stars.png",
  "./assets/title.png",
  "./assets/vx01.png",
  "./assets/wisp.png",
  "./draw.js",
  "./engine.js",
  "./index.html",
  "./manifest.webmanifest",
  "./music.js",
  "./pwa.js",
  "./sound.js",
  "./style.css"
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(ASSETS);
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === 'navigate') {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
      return fetch(request);
    }
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    return fetch(request);
  })());
});
