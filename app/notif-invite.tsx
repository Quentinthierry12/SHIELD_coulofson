"use client";
import { useEffect, useState } from "react";
import { toast } from "@/lib/ui-store";
import { pushSupported, getPushConfig, getExistingSubscription, subscribeThisDevice } from "@/lib/push-client";

// Remembered per browser so we invite once, not on every launch.
const DISMISS_KEY = "shield_notif_invite_dismissed";

// A gentle bar, shown once, inviting the agent to turn on signature alerts. It only
// appears when push can actually work here AND the agent hasn't decided yet:
//   - browser supports push, server has VAPID keys (getPushConfig.enabled)
//   - permission is still "default" (not already granted or denied)
//   - no subscription exists yet, and the invite wasn't dismissed before
// On unauthenticated pages getPushConfig returns null, so it stays hidden.
export default function NotifInvite() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    if (Notification.permission !== "default") return;
    try { if (localStorage.getItem(DISMISS_KEY)) return; } catch { /* private mode */ }
    let cancelled = false;
    (async () => {
      const cfg = await getPushConfig();
      if (cancelled || !cfg?.enabled) return;
      const existing = await getExistingSubscription();
      if (!cancelled && !existing) setShow(true);
    })();
    return () => { cancelled = true; };
  }, []);

  function remember() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode */ }
  }

  async function enable() {
    setBusy(true);
    try {
      const r = await subscribeThisDevice();
      if (r === "on") { toast("Notifications enabled.", "success"); setShow(false); }
      else if (r === "denied") { toast("Notifications blocked. Re-enable them via 🔔 Alerts.", "error"); remember(); setShow(false); }
      else if (r === "dismissed") { setShow(false); } // keep the invite for next time
      else toast("Couldn't enable notifications.", "error");
    } finally {
      setBusy(false);
    }
  }

  function later() { remember(); setShow(false); }

  if (!show) return null;

  return (
    <div className="notif-invite" role="dialog" aria-label="Enable notifications">
      <span className="notif-invite-txt">
        🔔 Turn on notifications to get alerted the moment a document is waiting for your signature.
      </span>
      <div className="notif-invite-actions">
        <button className="small" onClick={enable} disabled={busy}>{busy ? "Enabling…" : "Enable"}</button>
        <button className="ghost small" onClick={later} disabled={busy}>Later</button>
      </div>
    </div>
  );
}
