/* S.H.I.E.L.D. — Service Worker minimal.
   Objectif : rendre le portail installable (PWA) et fournir un repli hors-ligne,
   SANS jamais mettre en cache de contenu authentifié ou classifié.

   Stratégie :
   - On ne met en cache que la « coquille » statique (offline, icônes, logos).
   - Les navigations (documents HTML) : réseau d'abord, repli sur /offline.html.
   - Tout le reste (API, OnlyOffice, POST, cross-origin) : passe-plat direct réseau,
     jamais stocké — évite de servir des données sensibles périmées. */

const CACHE = "shield-shell-v2";
const SHELL = ["/offline.html", "/icon.svg", "/icon-512.png", "/logo.png", "/logo-white.png"];

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

/* ===== Web Push =====
   Le serveur envoie un petit JSON { title, body, url, tag } — jamais de contenu
   classifié : juste de quoi afficher une bannière et savoir quoi ouvrir au clic.
   Le détail se charge depuis le portail (authentifié) une fois la page ouverte. */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || "S.H.I.E.L.D.";
  const options = {
    body: data.body || "",
    // Grande icône du corps : PNG opaque (fond sombre + aigle), visible quel que soit
    // le thème clair/sombre de la notification.
    icon: "/icon-512.png",
    // Badge (petite icône monochrome de la barre d'état) : Android n'utilise QUE la
    // silhouette (canal alpha). Une image opaque donnerait un carré blanc plein, d'où
    // le logo blanc sur fond transparent → silhouette de l'aigle.
    badge: "/logo-white.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/dashboard" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Réutiliser un onglet du portail déjà ouvert plutôt que d'en empiler un nouveau.
      for (const c of clients) {
        try {
          const u = new URL(c.url);
          if (u.origin === self.location.origin && "focus" in c) {
            c.navigate(target);
            return c.focus();
          }
        } catch (e) { /* ignore */ }
      }
      return self.clients.openWindow(target);
    })
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
