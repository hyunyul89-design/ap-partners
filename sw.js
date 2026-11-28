/* ==========================================================================
   AP PARTNERS · 에이피파트너 — 서비스 워커 (Service Worker)
   배포 위치: https://apchangup.com/sw.js
   스코프    : /  (이 파일이 있는 폴더가 그대로 스코프가 됩니다)

   캐시 정책 (v1.1.28 — 관리자 대기 손님·매칭 추가)
   - HTML(index.html · 점포/브랜드 페이지) : 네트워크 우선 → 오프라인일 때 캐시
   - CSS · JS · data/listings.json         : 네트워크 우선 → 오프라인일 때 캐시
     (예전에는 CSS/JS 를 캐시 우선으로 두어, 새 index.html + 옛 styles.css 가
      섞여 나오는 사고가 있었습니다. 이제 항상 네트워크의 최신 파일을 씁니다.)
   - 이미지 · 아이콘 · 폰트               : 캐시 우선 (거의 바뀌지 않고, ?v= 로 갱신)
   - 그 밖의 요청(상담 접수 POST, 구글 시트, 외부 도메인)은 가로채지 않습니다.

   갱신 방식
   - 새 버전이 설치되면 곧바로 skipWaiting() 으로 대기 없이 활성화하고,
     activate 에서 이전 ap- 캐시를 모두 지운 뒤 clients.claim() 으로
     열려 있는 화면까지 즉시 넘겨받습니다.
   ========================================================================== */

var SW_VERSION = 'v1.1.29';
var CACHE_PREFIX = 'ap-';
var STATIC_CACHE = 'ap-static-' + SW_VERSION;
var DATA_CACHE = 'ap-data-' + SW_VERSION;

/* 앱을 처음 열 때 미리 받아 두는 파일 (sw.js 기준 상대 경로 = /).
   전부 network-first 로 다시 확인하므로, 설치는 '오프라인 첫 화면'용 안전판입니다. */
var PRECACHE_URLS = [
  './',
  './index.html',
  './admin.html',
  './styles.css',
  './seo.css',
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
        /* cache:'reload' 로 브라우저 HTTP 캐시를 건너뛰고 서버의 최신 파일을 담습니다.
           한 파일이 실패해도 설치는 끝나도록 개별로 처리합니다. */
        return Promise.all(PRECACHE_URLS.map(function (url) {
          return cache.add(new Request(url, { cache: 'reload' })).catch(function () { /* 개별 실패는 무시 */ });
        }));
      }),
      caches.open(DATA_CACHE).then(function (cache) {
        return cache.add(new Request(DATA_URL, { cache: 'reload' })).catch(function () { /* 무시 */ });
      })
    ]).then(function () {
      /* 새 버전은 대기하지 않고 바로 활성화합니다. */
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        /* ap- 로 시작하는 이전 버전 캐시는 전부 삭제 (ap-static-구버전, ap-data-구버전) */
        if (key.indexOf(CACHE_PREFIX) === 0 && key !== STATIC_CACHE && key !== DATA_CACHE) {
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
  /* 폴더 주소(/)로 들어오는 요청도 문서입니다. */
  return url.pathname.charAt(url.pathname.length - 1) === '/';
}

function offlineResponse() {
  return new Response('오프라인 상태입니다. 연결 후 다시 시도해 주세요.', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

/* 네트워크 우선: 성공하면 캐시에 갱신본을 남기고, 실패하면 캐시로 대응.
   ?v= 가 붙은 요청도 오프라인에서 찾을 수 있도록 캐시 조회는 ignoreSearch 로 합니다. */
function networkFirst(request, cacheName, fallbackUrl) {
  return caches.open(cacheName).then(function (cache) {
    return fetch(request).then(function (response) {
      if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
      return response;
    }).catch(function () {
      return cache.match(request, { ignoreSearch: true }).then(function (cached) {
        if (cached) return cached;
        if (fallbackUrl) return caches.match(fallbackUrl, { ignoreSearch: true }).then(function (fallback) {
          return fallback || offlineResponse();
        });
        return offlineResponse();
      });
    });
  });
}

/* 캐시 우선 + 백그라운드 갱신 (이미지·아이콘·폰트 전용) */
function cacheFirst(request, cacheName) {
  return caches.open(cacheName).then(function (cache) {
    return cache.match(request, { ignoreSearch: true }).then(function (cached) {
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

  /* 매물 목록: 항상 네트워크 우선 */
  if (isDataRequest(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE, null));
    return;
  }

  /* 문서(HTML): 네트워크 우선, 오프라인이면 캐시된 index.html */
  if (isHtmlRequest(request, url)) {
    event.respondWith(networkFirst(request, STATIC_CACHE, './index.html'));
    return;
  }

  /* 화면을 좌우하는 코드/스타일: 반드시 네트워크 우선 (구버전 CSS 사고 방지) */
  if (/\.(?:css|js|json|webmanifest|xml|txt)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request, STATIC_CACHE, null));
    return;
  }

  /* 이미지·아이콘·폰트: 캐시 우선 (?v= 로 갱신) */
  if (/\.(?:png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|otf)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  /* 그 밖의 같은 주소 요청은 네트워크 우선 후 캐시 */
  event.respondWith(networkFirst(request, STATIC_CACHE, null));
});
