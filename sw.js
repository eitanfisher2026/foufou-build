// FouFou Service Worker v3.23.42
// Strategy: Network First — תמיד מנסה רשת, cache רק אם אין חיבור
// זה בטוח: המשתמש תמיד מקבל את הגרסה העדכנית כשיש חיבור

const CACHE_NAME = 'foufou-dev-v4.0.5';

// קבצים לcache לoffline fallback בלבד
const OFFLINE_ASSETS = [
  '/FouFou-dev/',
  '/FouFou-dev/index.html',
  '/FouFou-dev/app-data.js?v=4.0.5',
  '/FouFou-dev/app-code.js?v=4.0.5'
];

// ──── Install: שמור assets בסיסיים ────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // best-effort — לא נכשל אם אחד לא עלה
      return Promise.allSettled(
        OFFLINE_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ──── Activate: מחק cache ישנים ────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ──── Fetch: Network First ────
self.addEventListener('fetch', function(event) {
  // רק GET requests
  if (event.request.method !== 'GET') return;

  // API calls (Firebase, Google) — תמיד רשת, אל תגע
  var url = event.request.url;
  if (url.includes('firebase') ||
      url.includes('googleapis') ||
      url.includes('firebaseio') ||
      url.includes('gstatic') ||
      url.includes('cdnjs') ||
      url.includes('cdn.jsdelivr') ||
      url.includes('tailwindcss') ||
      url.includes('unpkg')) {
    return; // נתן לדפדפן לטפל
  }

  event.respondWith(
    // נסה רשת קודם
    fetch(event.request).then(function(response) {
      // שמור עותק בcache
      if (response && response.status === 200) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, clone);
        });
      }
      return response;
    }).catch(function() {
      // אין רשת — החזר מcache
      return caches.match(event.request).then(function(cached) {
        return cached || caches.match('/FouFou-dev/index.html');
      });
    })
  );
});




