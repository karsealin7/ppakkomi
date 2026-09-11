/* =====================================================================
   빠꼬미 — 오프라인 실행 (STEP 11)

   ★ 이 파일이 하는 일은 하나뿐이다.
     빠꼬미 "프로그램 파일"을 폰에 넣어 두어, 통신이 없어도 앱이 열리게 한다.

   ★ 이 파일이 절대 하지 않는 일
     - IndexedDB 를 열지 않는다. 읽지도, 쓰지도, 지우지도 않는다.
       (이 파일 전체에 indexedDB 라는 낱말이 이 주석 말고는 없다)
     - 자재·히스토리에 손대지 않는다.
     - 사진을 캐시하지 않는다.
     - 바깥으로 아무것도 보내지 않는다.

   ★ 두 저장소의 역할을 섞지 않는다
         IndexedDB     = 자재와 히스토리   ← 사람의 기억. 건드리면 안 된다
         Cache Storage = 빠꼬미 프로그램   ← 언제든 다시 받을 수 있다
   ===================================================================== */

/* 앱 껍데기가 바뀌면 이 이름의 끝 숫자를 올린다.
   그러면 activate 단계에서 옛 캐시가 정리되고 새것으로 갈린다. */
var CACHE = "ppakkomi-shell-step11-v1";

/* 캐시할 것 — 빠꼬미 프로그램 전부. 전부 상대경로다.
   ★ GitHub Pages 는 /ppakkomi/ 아래에 있다. "/index.html" 로 쓰면 남의 자리를 가리킨다. */
var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

/* 통신이 느릴 때 이만큼만 기다리고 캐시로 넘어간다.
   ★ 현장에서 신호가 약할 때 앱이 하얀 화면으로 멈춰 있으면 안 된다. */
var NET_TIMEOUT = 3000;

// ---------------------------------------------------------------------
// 설치 — 프로그램 파일을 폰에 넣는다
// ---------------------------------------------------------------------
self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* addAll 은 하나만 실패해도 전부 실패한다.
         한 파일이 없더라도 나머지는 저장되도록 하나씩 넣는다. */
      return Promise.all(SHELL.map(function (u) {
        return c.add(new Request(u, { cache: "reload" })).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

// ---------------------------------------------------------------------
// 활성화 — 빠꼬미의 '옛 캐시'만 지운다
// ---------------------------------------------------------------------
self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (n) {
        /* ★ 이름이 ppakkomi-shell- 로 시작하고, 지금 쓰는 것이 아닐 때만 지운다.
           ★ 이것은 Cache Storage 다. IndexedDB 와는 완전히 다른 저장소다. */
        if (n !== CACHE && n.indexOf("ppakkomi-shell-") === 0) return caches.delete(n);
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// ---------------------------------------------------------------------
// 요청 처리
// ---------------------------------------------------------------------
function fromCache(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (r) {
    if (r) return r;
    /* 주소 뒤에 ?11 같은 것이 붙어 있어도, 첫 화면은 index.html 로 답한다 */
    return caches.match("./index.html").then(function (i) {
      return i || caches.match("./");
    });
  });
}

function putCache(req, res) {
  /* 성공한 응답만 담는다. 오류 페이지를 캐시해 두면 오프라인에서 그 오류가 나온다. */
  if (!res || !res.ok || res.type !== "basic") return res;
  var copy = res.clone();
  caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
  return res;
}

/* 통신 먼저, 안 되면 캐시 — 첫 화면과 index.html 에 쓴다.
   ★ 이래야 새 버전을 올렸을 때 옛 화면에 갇히지 않는다. */
function networkFirst(req) {
  return new Promise(function (resolve) {
    var done = false;
    var timer = setTimeout(function () {
      if (!done) { done = true; fromCache(req).then(resolve); }
    }, NET_TIMEOUT);

    fetch(req).then(function (res) {
      if (done) { putCache(req, res); return; }
      done = true; clearTimeout(timer);
      resolve(putCache(req, res));
    }).catch(function () {
      if (done) return;
      done = true; clearTimeout(timer);
      fromCache(req).then(function (r) {
        resolve(r || new Response("오프라인입니다.", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
        }));
      });
    });
  });
}

/* 캐시 먼저, 뒤에서 조용히 새로 받아 둠 — 아이콘·매니페스트에 쓴다 */
function cacheFirst(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (hit) {
    var net = fetch(req).then(function (res) { return putCache(req, res); }).catch(function () { return null; });
    return hit || net.then(function (r) {
      return r || new Response("", { status: 504 });
    });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;

  /* 읽기(GET) 만 다룬다 */
  if (req.method !== "GET") return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* 같은 주소(origin)의 것만 다룬다. http/https 가 아닌 것(blob: 등)은 건드리지 않는다 —
     ★ 사진 미리보기가 쓰는 blob: 주소가 여기 걸리면 안 된다. */
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  /* 내 자리(/ppakkomi/) 밖은 건드리지 않는다 */
  var scope = new URL("./", self.location.href).pathname;
  if (url.pathname.indexOf(scope) !== 0) return;

  /* ★ 자기 자신(sw.js)은 절대 가로채지도, 캐시하지도 않는다.
     캐시에서 나온 옛 서비스워커가 계속 살아나면
     새 빠꼬미를 올려도 폰이 영원히 옛 버전에 갇힌다. */
  if (url.pathname === new URL("./sw.js", self.location.href).pathname) return;

  if (req.mode === "navigate" || /\/$|\/index\.html$/.test(url.pathname)) {
    e.respondWith(networkFirst(req));
    return;
  }
  e.respondWith(cacheFirst(req));
});
