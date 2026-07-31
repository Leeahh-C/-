importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCKXoFSvJUWQ8QDNNmQuJvAwSzYKZ5EELM",
  authDomain: "railopoly.firebaseapp.com",
  projectId: "railopoly",
  storageBucket: "railopoly.firebasestorage.app",
  messagingSenderId: "799199740741",
  appId: "1:799199740741:web:742802d2643c3a43c4742c"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] 收到背景訊息：", payload);

  const title =
    payload.notification?.title ||
    payload.data?.title ||
    "Railopoly";

  const options = {
    body:
      payload.notification?.body ||
      payload.data?.body ||
      "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: {
      url: payload.fcmOptions?.link || "./"
    }
  };

  return self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification.data?.url ||
    "https://leeahh-c.github.io/-/";

  event.waitUntil(clients.openWindow(targetUrl));
});
