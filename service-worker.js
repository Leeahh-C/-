importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCKXoFSvJUWQ8QDNNmQuJvAwSzYKZ5EELM',
  authDomain: 'railopoly.firebaseapp.com',
  projectId: 'railopoly',
  storageBucket: 'railopoly.firebasestorage.app',
  messagingSenderId: '799199740741',
  appId: '1:799199740741:web:742802d2643c3a43c4742c'
});

const messaging = firebase.messaging();
const CACHE_NAME = 'railopoly-v1.0.14';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './railopoly-home.png',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match('./index.html');
      return new Response('目前沒有網路連線', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
    })
  );
});

messaging.onBackgroundMessage(payload => {
  const data = payload.data || {};
  return self.registration.showNotification(data.title || 'Railopoly 通知', {
    body: data.body || '你有一則新訊息',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: data.tag || 'railopoly-message',
    renotify: true,
    data: {url: data.url || './'}
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || './', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(windowClients => {
    for (const client of windowClients) {
      if ('navigate' in client && 'focus' in client) return client.navigate(targetUrl).then(() => client.focus());
    }
    return self.clients.openWindow(targetUrl);
  }));
});
