# S.H.I.E.L.D.-style App — Starter Playbook

A reusable recipe to spin up a **new app with the same look, stack and architecture** as this
portal (dark "classified terminal" UI, auth + roles + clearance, a document Drive, an admin
command center). Follow it when you want to build another interface like the current one.

---

## 0. What you're reproducing

- A **dark tactical UI**: left rail, top bar, `panel` containers, document `card`s, tabs,
  status chips, modals, toasts.
- **Accounts** with roles (`agent` / `admin`) and a numeric **clearance** level.
- A **document Drive** (folders, granular permissions) — optional, needs OnlyOffice.
- **Notifications** (Web Push + Discord) — optional.
- An **admin "Command"** center.

You can take the whole thing, or just the **design system + auth + layout** and drop the
document/OnlyOffice parts.

---

## 1. Stack

| Layer | Choice |
|-------|--------|
| Framework | **Next.js 15** (App Router), TypeScript, React |
| DB | **PostgreSQL** via `pg` (raw SQL, no ORM) |
| Auth | **JWT session cookie** (`jose`) + **bcrypt** passwords |
| Editor (optional) | **OnlyOffice Document Server** (self-hosted) |
| Push (optional) | **Web Push** (VAPID, `web-push`) |
| Discord (optional) | OAuth login + bot DMs |
| Deploy | **Coolify** (Nixpacks, auto-deploy from git) |

Everything faction-specific comes from **env vars** — no rebuild to change deployment.

---

## 2. Project structure

```
app/
  layout.tsx        # <html>, metadata, PWA hooks, global CSS
  globals.css       # design tokens + every component class (the "look")
  page.tsx          # public landing (server component)
  login/page.tsx    # auth screen (client)
  dashboard/
    page.tsx        # server: auth gate + data fetch
    ui.tsx          # client: the interactive screen
  admin/
    page.tsx + ui.tsx
  api/              # route handlers (REST): auth, documents, admin, ...
lib/
  db.ts             # pg pool + idempotent migrate() (CREATE TABLE IF NOT EXISTS)
  session.ts        # signJWT / getSession (cookie), types
  ui-store.ts       # toast() / confirmDialog() / promptDialog() store
  permissions.ts    # role/clearance helpers
  push.ts, discord.ts  # optional integrations
public/             # logo.png, icons, manifest, sw.js
```

**The pattern for every screen**: a server `page.tsx` (checks `getSession()`, redirects if
needed, loads data) that renders a client `ui.tsx` (state, fetches to `/api/*`, interactivity).

---

## 3. The design system (what makes it look like S.H.I.E.L.D.)

### Tokens — top of `globals.css`
```css
:root{
  --bg:#070b12; --panel:#0d1420; --border:#1c2a3f;
  --accent:#4da6ff; --accent-dim:#1a4a7a;
  --text:#c9d6e5; --muted:#5f7590;
  --danger:#ff5c5c; --ok:#4dd08a;
}
```
- Body font: system sans (`"Segoe UI", system-ui`). Labels/brand/mono: `Consolas, monospace`
  (uppercase + letter-spacing for the "terminal" feel).
- Classification colors: **low = green**, **mid = amber**, **high = red** (kept separate from
  the blue accent).

### Core classes (reuse these — they carry the whole look)
| Class | Role |
|-------|------|
| `.panel` | bordered dark container (the workhorse) |
| `.card` / `.cards` (grid) | item/document cards |
| `.rail` + `.rail-btn` | left navigation |
| `.topbar` | header bar with search + user badge |
| `.tabs` | tab switcher |
| `.badge`, `.chip`, `.classif` (`low`/`mid`/`high`) | status pills |
| `.overlay` + `.modal` | dialogs |
| buttons: base, `.ghost`, `.small`, `.danger` | actions |
| `.empty` | empty-state block |

### Toasts & dialogs
`lib/ui-store.ts` exposes `toast()`, `confirmDialog()`, `promptDialog()`; a single `UiHost`
component (mounted in `layout.tsx`) renders them. Call from anywhere — no prop drilling.

---

## 4. Bootstrapping checklist

1. `npx create-next-app@latest` → TypeScript, App Router, no Tailwind (we use plain CSS).
2. **Copy `app/globals.css`** from this repo — this is 80% of the look. Trim classes you don't need.
3. **`lib/db.ts`**: a `pg` Pool + an idempotent `migrate()` that runs `CREATE TABLE IF NOT
   EXISTS …` on first `db()` call. Seed a first admin account.
4. **`lib/session.ts`**: `signJWT`/`getSession` over a `jose`-signed cookie; bcrypt for passwords.
5. **`lib/ui-store.ts` + `UiHost`**: toasts + confirm/prompt; mount `UiHost` in `layout.tsx`.
6. **Auth**: `login/page.tsx` + `api/auth/{register,login,logout}` route handlers.
7. **Main screen**: `dashboard/page.tsx` (gate + data) + `dashboard/ui.tsx` using
   `.rail/.topbar/.panel/.cards`.
8. **Roles & clearance**: add `role` and `clearance` to `users`; gate pages via `getSession()`
   and `lib/permissions.ts`.
9. **Optional modules**, add only what you need:
   - Documents + OnlyOffice (Document Server, `signFileToken`, callback route).
   - Web Push (VAPID keys, `sw.js`, subscribe endpoint).
   - Discord OAuth + bot DMs.
   - Admin "Command" center.
10. **PWA**: `app/manifest.ts` + `public/sw.js` + icons; `<html>` metadata in `layout.tsx`.
11. **Deploy** on Coolify (Nixpacks). Point it at the repo, set env, add a domain.

---

## 5. Make it a real starter kit (so future apps are fast)

Two ways:
- **Template repo** — copy this project, delete the S.H.I.E.L.D.-specific content (documents,
  missions, lore), keep `globals.css` + `lib/{db,session,ui-store,permissions}` + the layout
  shell. Push it as `app-starter`; every new app forks from it.
- **Brand config** — put name, tagline, accent color, logo behind a small `lib/brand.ts` read
  from `NEXT_PUBLIC_*` env, so a new interface differs by **env + logo only** (no code fork).

Recommended: keep **one starter repo** for the skeleton, and drive per-app identity from
`brand` + env. (We prototyped this before as "approach B" — it works.)

---

## 6. Env checklist (per deployment)

```
DATABASE_URL=postgres://...
APP_SECRET=...                 # signs the session cookie
PORTAL_URL=https://app.example # absolute URL of this deployment
ADMIN_PASSWORD=...             # first admin seed
# optional modules:
DS_PUBLIC_URL=...  OO_JWT_SECRET=...          # OnlyOffice
VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...   # push
DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... DISCORD_BOT_TOKEN=...  # Discord
# branding (if you wire lib/brand.ts):
NEXT_PUBLIC_BRAND_NAME=... NEXT_PUBLIC_BRAND_ACCENT=#4da6ff ...
```

---

## 7. Deploy on Coolify (quick)

1. New Application → this/starter repo → Nixpacks.
2. Set the env above (secrets marked as secret).
3. Add a domain; Coolify handles HTTPS.
4. Enable Automatic Deployment so a push to `main` redeploys.

---

## When you're ready

Ping me and I can either **extract this into a clean `app-starter` template** or **scaffold a
new app** from it end to end.
