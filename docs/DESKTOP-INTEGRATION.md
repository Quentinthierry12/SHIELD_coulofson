# OnlyOffice Desktop Editors — connecting the CDS portal

Goal: let an agent open the OnlyOffice **desktop app** (Windows), see **S.H.I.E.L.D. — Central
Document System** under **Connect to cloud → Connected clouds**, and browse/open documents
natively (native window, offline editing) instead of through a browser tab.

This is the OnlyOffice **"DMS provider"** integration. It has two halves.

---

## Half 1 — the login/logout handshake  ✅ implemented

Fully specified by *Desktop Editors → Usage API → Adding a DMS provider → Login and logout*, and
built in this repo:

| Piece | File |
|-------|------|
| Guarded `portal:login` / `portal:logout` helpers | `lib/desktop-portal.ts` |
| Bridge that keeps the registration in sync on every page | `app/desktop-portal.tsx` (mounted in `app/layout.tsx`) |
| Identity feed for the bridge | `app/api/me/route.ts` |
| Explicit logout on sign-out | `app/dashboard/ui.tsx`, `app/onboarding/ui.tsx` |

How it works:

- The desktop app exposes `window.AscDesktopEditor` inside its embedded browser. In a normal
  web browser this global is **undefined**, so every helper is a **no-op** — the web build is
  completely unaffected (no fetch, no side effect).
- When the portal runs inside the desktop app, on every authenticated page the bridge calls:
  ```js
  window.AscDesktopEditor.execCommand("portal:login", JSON.stringify({
    displayName: codename,
    email: "AG-1234@agents.shield",   // pseudo-address, never emailed
    domain: window.location.origin,   // the cloud entry point
    provider: "shield-cds",           // must match config.json id
    uiTheme: "theme-dark",
    userId: "<user id>"
  }));
  ```
  and on sign-out:
  ```js
  window.AscDesktopEditor.execCommand("portal:logout", JSON.stringify({ domain: window.location.origin }));
  ```
- The docs require `portal:login` on **all** pages reachable after login — that's why the bridge
  re-affirms it on every route change (cheap; only runs inside the desktop app).

Nothing here changes the web experience; it only activates inside the desktop shell.

---

## Half 2 — registering the provider + opening documents  ⏳ not finished

Login only tells the app "this cloud has an authenticated agent." For the app to actually
**list and open** CDS documents, two more OnlyOffice doc pages are needed (the site 403s our
fetcher — paste them and we finish this):

1. **Adding a DMS provider** → the exact schema of `config.json`
   (`public/desktop/config.json` is a scaffold — `id` is correct, the URL fields are guesses).
2. **Opening documents** → the contract for how the desktop app asks the portal for a file and
   how we hand back an editable document URL. This is where our existing `signFileToken()` +
   Document Server config plug in (likely a new `/api/desktop/open` route).

### The catch worth knowing

This is the **self-hosted / registered-provider** path. The `config.json` is read by a
**configured or self-built** OnlyOffice desktop client — it is **not** picked up by the public
installer. So "any agent downloads OnlyOffice and SHIELD appears" is **not** how it works; a
client that knows about our provider has to be distributed. That's the real cost of the desktop
route, and why the browser + Document Server flow already covers ~95% of the value.

---

## To finish

Paste the **"Adding a DMS provider"** and **"Opening documents"** pages, and I'll:
- lock down `public/desktop/config.json` to the real schema, and
- add the `/api/desktop/open` route that authorizes + returns the editor config for a requested
  document, reusing `signFileToken` and `SHIELD_CUSTOMIZATION`.
