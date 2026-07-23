// Bridge to the OnlyOffice Desktop Editors "DMS provider" API.
//
// When the portal is opened *inside* the OnlyOffice desktop app, the app exposes a global
// `window.AscDesktopEditor`. Calling `execCommand("portal:login", …)` registers this portal
// under the desktop app's "Connected clouds", so an agent can browse and open S.H.I.E.L.D.
// documents natively; `portal:logout` removes it and clears its cookies.
//
// In a normal browser `window.AscDesktopEditor` is undefined, so every function here is a
// guarded no-op — the web build is completely unaffected.
//
// Ref: OnlyOffice Desktop Editors → Usage API → Adding a DMS provider → Login and logout.

// The provider id must match the `id` declared in the desktop client's config.json
// (public/desktop/config.json). Keep the two in sync.
export const DESKTOP_PROVIDER = "shield-cds";

type DesktopEditor = { execCommand?: (command: string, args?: string) => void };

function desktopEditor(): DesktopEditor | null {
  if (typeof window === "undefined") return null;
  const ed = (window as unknown as { AscDesktopEditor?: DesktopEditor }).AscDesktopEditor;
  return ed && typeof ed.execCommand === "function" ? ed : null;
}

/** True only when the portal is running inside the OnlyOffice desktop app. */
export function isDesktopApp(): boolean {
  return desktopEditor() !== null;
}

export type DesktopIdentity = {
  id: number | string;
  matricule: string;
  codename: string;
};

// Registers this portal as a connected cloud for the signed-in agent. Per the OnlyOffice docs
// this must run on every page reachable after login, so the desktop app keeps the session — the
// bridge component calls it on each route change. Safe to call repeatedly.
export function desktopLogin(identity: DesktopIdentity) {
  const ed = desktopEditor();
  if (!ed) return;
  const params = {
    displayName: identity.codename,
    // Not a real mailbox — the portal never emails it. Mirrors the pseudo-address the mention
    // system uses so a desktop session maps back to the same account.
    email: `${identity.matricule}@agents.shield`,
    domain: window.location.origin, // the cloud's entry point
    provider: DESKTOP_PROVIDER,
    uiTheme: "theme-dark", // matches SHIELD_CUSTOMIZATION
    userId: String(identity.id),
  };
  try {
    ed.execCommand!("portal:login", JSON.stringify(params));
  } catch {
    // The desktop bridge must never wedge the portal.
  }
}

/** Removes this portal from the desktop app's connected clouds and clears its cookies. */
export function desktopLogout() {
  const ed = desktopEditor();
  if (!ed) return;
  try {
    ed.execCommand!("portal:logout", JSON.stringify({ domain: window.location.origin }));
  } catch {
    // ignore
  }
}
