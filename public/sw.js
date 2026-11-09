// Service worker mínimo: permite instalar la app.
// No almacena HTML ni JavaScript para evitar servir versiones antiguas.
// La API y los archivos de la aplicación siempre se consultan al servidor.
const CACHE = 'asistok-v-next-20261109';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.keys().then((ks) =>
    Promise.all(ks.filter((k) => k.startsWith('asistok-') && k !== CACHE).map((k) => caches.delete(k)))
  ));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // No interceptar solicitudes: el navegador consulta siempre al servidor.
});
