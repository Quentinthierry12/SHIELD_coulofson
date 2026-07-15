/* S.H.I.E.L.D. — Service Worker minimal.
   Objectif : rendre le portail installable (PWA) et fournir un repli hors-ligne,
   SANS jamais mettre en cache de contenu authentifié ou classifié.

   Stratégie :
   - On ne met en cache que la « coquille » statique (offline, icônes, logos).
   - Les navigations (documents HTML) : réseau d'abord, repli sur /offline.html.
   - Tout le reste (API, OnlyOffice, POST, cross-origin) : passe-plat direct réseau,
     jamais stocké — évite de servir des données sensibles périmées. */

const CACHE = "shield-shell-v1";
const SHELL = ["/offline.html", "/icon.svg", "/logo.png", "/logo-white.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // On ne gère que le même domaine et les requêtes GET.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Ne jamais toucher aux routes dynamiques / sensibles.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/onlyoffice") ||
    url.pathname.startsWith("/doc/")
  ) {
    return; // laisse le réseau gérer, sans cache
  }

  // Navigations HTML : réseau d'abord, repli hors-ligne.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  // Ressources statiques de la coquille : cache d'abord, réseau en secours.
  if (SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});
