const CACHE = 'neon-striker-pwa-v2';
const SCOPE = new URL(self.registration.scope);
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
  "./manifest.webmanifest",
  "./music.js",
  "./pwa.js",
  "./sound.js",
  "./style.css"
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(path => new Request(new URL(path, SCOPE), {cache:'reload'})));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('neon-striker-pwa-') && name !== CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function readCached(request) {
  try {
    return await caches.match(request, { cacheName: CACHE, ignoreSearch: true });
  } catch {
    return undefined;
  }
}

async function openGame(request) {
  try {
    return await fetch(request);
  } catch (networkError) {
    const shell = await readCached(SCOPE.href);
    if (!shell || !shell.ok || !shell.headers.get('content-type')?.includes('text/html')
        || new URL(shell.url).origin !== SCOPE.origin) throw networkError;
    // A navigation cannot reuse a response with a followed redirect.
    return shell.redirected
      ? new Response(shell.body, { status: shell.status, headers: shell.headers })
      : shell;
  }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== SCOPE.origin) return;

  if (request.mode === 'navigate') {
    if (url.pathname === SCOPE.pathname || url.pathname === SCOPE.pathname + 'index.html') {
      event.respondWith(openGame(request));
    }
    return;
  }

  event.respondWith((async () => {
    const cached = await readCached(request);
    return cached || fetch(request);
  })());
});
