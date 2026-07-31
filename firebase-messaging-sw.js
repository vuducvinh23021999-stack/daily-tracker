importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const FIREBASE_CONFIG = {
  apiKey: '__FIREBASE_API_KEY__',
  authDomain: 'hagiang-planner.firebaseapp.com',
  projectId: 'hagiang-planner',
  storageBucket: 'hagiang-planner.appspot.com',
  messagingSenderId: '__FIREBASE_SENDER_ID__',
  appId: '__FIREBASE_APP_ID__'
};

firebase.initializeApp(FIREBASE_CONFIG);
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const data = payload.data || {};
  const notification = payload.notification || {};
  const title = notification.title || '⏰ Daily Tasks';
  const body = notification.body || 'Đến giờ làm việc!';
  const icon = 'icons/icon-192.png';
  const options = {
    body: body,
    icon: icon,
    badge: icon,
    data: data,
    vibrate: [200, 100, 200],
    actions: [
      { action: 'done', title: '✅ Đã làm' },
      { action: 'later', title: '⏳ 5 phút sau' }
    ]
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const data = event.notification.data || {};
  const url = './?task=' + encodeURIComponent(data.taskId || '');
  if (event.action === 'done') {
    clients.openWindow(url + '&done=1');
  } else if (event.action === 'later') {
    clients.openWindow(url + '&snooze=1');
  } else {
    clients.openWindow(url);
  }
});
