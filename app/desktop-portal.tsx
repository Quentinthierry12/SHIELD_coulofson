"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isDesktopApp, desktopLogin, desktopLogout } from "@/lib/desktop-portal";

// Mounted once in the root layout. When — and only when — the portal is opened inside the
// OnlyOffice desktop app, it keeps the "Connected clouds" registration in sync with the session:
// re-affirms portal:login on every authenticated page, and portal:logout once the session is gone.
// In a normal browser isDesktopApp() is false and this does nothing (no fetch, no effect).
export default function DesktopPortalBridge() {
  const pathname = usePathname();
  useEffect(() => {
    if (!isDesktopApp()) return;
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (cancelled) return;
        if (me && me.id) desktopLogin(me);
        else desktopLogout();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);
  return null;
}
