const SELF_ORIGIN = self.location.origin;
const PROXY_BASE = SELF_ORIGIN + '/proxy?url=';

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 自サイトリクエストはスルー
  if (url.origin === SELF_ORIGIN) return;

  // すべての外部リクエストをプロキシ経由に
  const proxyUrl = PROXY_BASE + encodeURIComponent(url.href);
  const newReq = new Request(proxyUrl, {
    method: event.request.method,
    headers: event.request.headers,
    body: event.request.method !== 'GET' && event.request.method !== 'HEAD' ? event.request.body : undefined,
    mode: 'same-origin',
    credentials: event.request.credentials,
    cache: event.request.cache,
    redirect: event.request.redirect,
    referrer: event.request.referrer,
    integrity: event.request.integrity
  });
  event.respondWith(fetch(newReq));
});
