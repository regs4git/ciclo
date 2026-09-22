// ===== Service Worker "Ciclo" =====
// IMPORTANTE: ao publicar uma nova versão da app, muda SEMPRE este número.
// É o que despoleta a limpeza de cache antigo e o aviso de "nova versão"
// na interface — nunca apaga localStorage, apenas os ficheiros da app.
const CACHE_VERSION = 'v3';
const CACHE_NAME = `ciclo-cache-${CACHE_VERSION}`;

// Ficheiros essenciais para a app funcionar offline.
// Caminhos relativos porque o GitHub Pages pode publicar num subcaminho
// (ex. https://user.github.io/ciclo/), não na raiz do domínio.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/i18n.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.ico'
];

self.addEventListener('install', (event) => {
  // cache.addAll() falha por completo se UM SÓ ficheiro der erro (ex. 404
  // temporário durante a propagação do GitHub Pages), o que pode levar a
  // tentativas de instalação repetidas e a comportamento imprevisível do
  // aviso de "nova versão". Aqui cada ficheiro é pedido individualmente,
  // para uma falha isolada não arrastar a instalação toda.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          fetch(url).then((res) => (res.ok ? cache.put(url, res) : null)).catch(() => null)
        )
      )
    )
    // Não ativa imediatamente: só quando o utilizador confirmar no
    // banner "nova versão disponível" (skipWaiting via mensagem).
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('ciclo-cache-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// O utilizador (via app.js) manda esta mensagem quando clica em
// "Atualizar agora" no banner de nova versão.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Estratégia: network-first para os ficheiros da app (para apanhar
// updates assim que há ligação), com fallback para cache quando offline.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // não intercetar pedidos externos

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
