# S.H.I.E.L.D. Office — Editor reskin (Approach B scaffold)

Approach **A** (live) reskins the editor purely through OnlyOffice's supported
customization API — see `SHIELD_CUSTOMIZATION` in `lib/onlyoffice.ts`. It gives the
dark theme, the S.H.I.E.L.D. branding in the About dialog, and removes ONLYOFFICE
marketing. Zero risk, no image rebuild.

Approach **B** goes deeper: it modifies the editor's own interface (logos baked in,
custom accent theme, renamed apps, custom loading screen). This folder is the
**ready-to-run scaffold** — nothing here is deployed until you decide to.

There are two levels of B, from least to most effort:

## B1 — Image patch (recommended first step, ~2-3h, reversible)
Layer a custom theme + logo onto the working `btactic` document-server image,
without rebuilding from source. Uses `Dockerfile.shield` here.

Steps:
1. Front the SHIELD document server (`shield-office-docs`) uses a Dockerfile deploy
   on Coolify. Replace its Dockerfile with `Dockerfile.shield` (it extends the current
   unlimited build and adds a branding layer).
2. The branding layer:
   - fetches the white logo from the portal and swaps the header logos it finds
     (self-locating `find`, guarded so a missing path never fails the build),
   - installs `theme/shield-dark.json` as a custom UI theme,
   - patches the loading-screen accent color.
3. Redeploy `shield-office-docs`. Test the editor. If anything looks off, revert to the
   previous Dockerfile (kept in `office-theme/Dockerfile.current`) and redeploy — the
   documents and portal are untouched.

## B2 — Full source fork (highest fidelity, several hours, higher maintenance)
Rebuild the document server from a forked `web-apps`:
1. Fork `ONLYOFFICE/web-apps` (or start from `btactic-oo/web-apps` to stay aligned with
   the unlimited build tooling) → e.g. `usa-dev-secureoffice/web-apps`.
2. In the fork, edit under `apps/common/`:
   - `main/resources/img/` — replace `logo` / `header` SVGs with the SHIELD eagle.
   - theme JSONs in `main/resources/themes/` — add `shield-dark`.
   - text/localization for app names ("Report" instead of "Document") in the
     `l10n`/`locale` files.
3. Build with `btactic-oo/build_tools`:
   ```
   git clone https://github.com/btactic-oo/build_tools
   # point build_tools at your web-apps fork (branch), then:
   cd build_tools/tools/linux && ./automate.py
   ```
   This compiles the whole document server (long) and produces artifacts you package
   with `btactic-oo/document-server-package` into a `.deb`, exactly like the current
   unlimited build — then bake it into an image the same way `shield-office-docs` does now.
4. Re-merge the fork on each OnlyOffice upgrade (keep SHIELD changes isolated in the
   theme/img/locale files to make merges trivial).

## Files here
- `theme/shield-dark.json` — the SHIELD UI theme (accent, background, text colors).
- `Dockerfile.shield` — B1 image-patch Dockerfile (starting point, test before prod).
- `Dockerfile.current` — the exact Dockerfile currently powering `shield-office-docs`,
  kept so B1 is trivially reversible.

## SHIELD palette (matches the portal)
- background `#070b12`, panel `#0d1420`, border `#1c2a3f`
- accent `#4da6ff`, accent-dim `#1a4a7a`, text `#c9d6e5`, danger `#ff5c5c`
