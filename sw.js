/* ==========================================================================
   AP PARTNERS · 에이피파트너 — 서비스 워커 (Service Worker)
   배포 위치: https://hyunyul89-design.github.io/ap-partners/sw.js
   스코프    : /ap-partners/  (이 파일이 있는 폴더가 그대로 스코프가 됩니다)

   캐시 정책
   - 정적 자산(styles.css · app.js · 아이콘 등): 캐시 우선 + 뒤에서 조용히 네트워크 갱신
     (stale-while-revalidate) → 두 번째 방문부터 즉시 뜨고, 다음 방문에 최신 파일이 반영됩니다.
   - data/listings.json: 네트워크 우선(network-first) → 매물은 항상 최신을 가져오고,
     오프라인일 때만 마지막으로 받아 둔 목록을 보여 줍니다.
   - 페이지 이동(HTML): 네트워크 우선 → 오프라인일 때 캐시된 페이지로 대응합니다.
   - 그 밖의 요청(상담 접수 POST, 구글 시트, 외부 도메인)은 가로채지 않고 브라우저에 그대로 넘깁니다.
   ========================================================================== */

var SW_VERSION = 'v1.1.4';
var STATIC_CACHE = 'ap-static-' + SW_VERSION;
var DATA_CACHE = 'ap-data-' + SW_VERSION;

/* 앱을 처음 열 때 미리 받아 두는 파일 (sw.js 기준 상대 경로 = /ap-partners/) */
var PRECACHE_URLS = [
  './',
  './index.html',
  './admin.html',
  './styles.css',
  './app.js',
  './admin.js',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
  './assets/og-cover.png',
  './assets/business-card.jpg'
];

var DATA_URL = './data/listings.json';

self.addEventListener('install', function (event) {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(function (cache) {
        /* 한 파일이 없거나 실패해도 설치는 끝나도록 개별로 담습니다. */
        return Promise.all(PRECACHE_URLS.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' })).catch(function () { /* 개별 실패는 무시 */ });
        }));
      }),
      /* 매물 목록은 네트워크 우선이지만, 오프라인일 때 보여 줄 마지막 사본을 설치 때도 담아 둡니다. */
      caches.open(DATA_CACHE).then(function (cache) {
        return cache.add(new Request(DATA_URL, { cache: 'reload' })).catch(function () { /* 무시 */ });
      })
    ]).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key.indexOf('ap-') === 0 && key !== STATIC_CACHE && key !== DATA_CACHE) {
          return caches.delete(key);
        }
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function inScope(url) {
  return url.pathname.indexOf(new URL(self.registration.scope).pathname) === 0;
}

function isDataRequest(url) {
  return /\/data\/listings\.json$/.test(url.pathname);
}

function isHtmlRequest(request, url) {
  if (request.mode === 'navigate') return true;
  if (/\.html$/.test(url.pathname)) return true;
  /* 폴더 주소(/ap-partners/)로 들어오는 요청도 문서입니다. */
  return url.pathname.charAt(url.pathname.length - 1) === '/';
}

/* 네트워크 우선: 성공하면 캐시에 갱신본을 남기고, 실패하면 캐시로 대응 */
function networkFirst(request, cacheName, fallbackUrl) {
  return caches.open(cacheName).then(function (cache) {
    return fetch(request).then(function (response) {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    }).catch(function () {
      return cache.match(request, { ignoreSearch: true }).then(function (cached) {
        if (cached) return cached;
        if (fallbackUrl) return caches.match(fallbackUrl);
        return new Response('오프라인 상태입니다. 연결 후 다시 시도해 주세요.', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    });
  });
}

/* 캐시 우선 + 백그라운드 갱신 (stale-while-revalidate) */
function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request, { ignoreSearch: false }).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (response && (response.ok || response.type === 'opaque')) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function () { return null; });
      return cached || network.then(function (response) {
        if (response) return response;
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    });
  });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;

  /* GET 이외(상담 접수 POST 등)는 서비스 워커가 다루지 않습니다. */
  if (request.method !== 'GET') return;

  var url;
  try { url = new URL(request.url); } catch (e) { return; }

  /* 외부 도메인(구글 시트 웹훅 등)과 스코프 밖 주소는 그대로 통과시킵니다. */
  if (!isSameOrigin(url) || !inScope(url)) return;

  if (isDataRequest(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE, null));
    return;
  }

  if (isHtmlRequest(request, url)) {
    event.respondWith(networkFirst(request, STATIC_CACHE, './index.html'));
    return;
  }

  if (/\.(?:css|js|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  /* 그 밖의 같은 주소 요청은 네트워크 우선 후 캐시 */
  event.respondWith(networkFirst(request, STATIC_CACHE, null));
});
