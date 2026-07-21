# Coolify Ops

A tiny, **dependency-free** dashboard (single `server.js`, Node ≥ 18, no `npm install`) to
list, deploy and control the applications on a Coolify instance through its v4 API.

It's a **separate application** from the S.H.I.E.L.D. portal — deploy it as its own Coolify
app. The API token stays server-side and is never sent to the browser.

## What it does
- Password-gated console (signed cookie, no database).
- Lists Coolify **applications** with status, and **servers**.
- Per-app actions: **Deploy**, **Restart**, **Stop**, **Start**.

## Environment
| Var | Required | Example |
|-----|----------|---------|
| `COOLIFY_URL` | yes | `https://coolify.quentinthierry.fr` |
| `COOLIFY_TOKEN` | yes | *(Coolify → Keys & Tokens → API tokens)* |
| `OPS_PASSWORD` | yes | a strong password to open the dashboard |
| `OPS_SECRET` | no | random string to sign the session cookie (derived from `OPS_PASSWORD` if unset) |
| `PORT` | auto | set by Coolify |

Create the **`COOLIFY_TOKEN`** in Coolify itself (Keys & Tokens → API tokens). Give it the
scope you're comfortable with — read + deploy is enough for this dashboard. Store it as a
**secret env var** on this app; never paste it anywhere else.

## Deploy on Coolify
1. New application → this Git repo → **Base Directory** = `coolify-ops`.
2. Build pack: **Nixpacks** (auto-detects Node; runs `npm start` → `node server.js`).
3. Set the env vars above (mark `COOLIFY_TOKEN` and `OPS_PASSWORD` as secrets).
4. Give it a domain (e.g. `ops.site-pines.quentinthierry.fr`) and deploy.

## Run locally
```
COOLIFY_URL=https://coolify.quentinthierry.fr COOLIFY_TOKEN=... OPS_PASSWORD=... node server.js
```

## Notes / limits
- The Coolify **v4 API** covers apps, servers, and deploy/restart/stop/start. Detailed
  **per-app resource consumption (CPU/RAM)** isn't consistently exposed by the API across
  versions — the dashboard shows status and whatever server data the API returns, and the
  "resources" line lights up if/when your instance exposes it.
- Action endpoints target the documented routes (`GET /api/v1/deploy?uuid=`,
  `/api/v1/applications/{uuid}/restart|stop|start`). If your Coolify version differs, they're
  one-liners to adjust in `server.js` (`act` / the `/api/action` handler).
