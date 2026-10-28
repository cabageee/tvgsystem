const CACHE_NAME = 'thien-vy-global-v48';
const APP_FILES = [
  './',
  './index.html',
  './executive-tracker.html',
  './profiles.html',
  './assignments.html',
  './attendance.html',
  './daily-summary.html',
  './inactive-students.html',
  './teachers.html',
  './levels.html',
  './teacher-attendance.html',
  './change-password.html',
  './app.js',
  './app.css',
  './assets/fontawesome/css/all.min.css',
  './assets/fontawesome/webfonts/fa-solid-900.woff2',
  './tailwind.css',
  './manifest.webmanifest',
  './app-icon.svg',
  './icon-192.png',
  './icon-512.png',
  './Logo Thien Vy.png'
];
const APP_FILE_URLS = new Set(
  APP_FILES.map(file => new URL(file, self.location.href).href)
);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('thien-vy-global-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        const cachedPage = await cache.match(request, { ignoreSearch: true });
        if (cachedPage) return cachedPage;

        if (url.pathname.endsWith('/')) {
          const homePage = await cache.match(new URL('./index.html', self.location.href).href);
          if (homePage) return homePage;
        }

        throw error;
      }
    })());
    return;
  }

  if (APP_FILE_URLS.has(request.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch (error) {
        return await cache.match(request) || Response.error();
      }
    })());
  }
});
