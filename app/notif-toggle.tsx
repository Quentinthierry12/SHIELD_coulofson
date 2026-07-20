"use client";
import { useEffect, useState } from "react";
import { toast } from "@/lib/ui-store";
import { pushSupported, getPushConfig, getExistingSubscription, subscribeThisDevice, unsubscribeThisDevice } from "@/lib/push-client";

type State = "loading" | "unsupported" | "off" | "on" | "denied";

// A single button in the topbar that turns PWA push notifications on/off for this device.
// Hidden entirely when the server has no VAPID keys, or the browser can't do push.
export default function NotifToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) { setState("unsupported"); return; }
    let cancelled = false;
    (async () => {
      // Server-side switch: no VAPID key → the whole feature stays invisible.
      const cfg = await getPushConfig();
      if (cancelled) return;
      if (!cfg?.enabled) { setState("unsupported"); return; }
      if (Notification.permission === "denied") { setState("denied"); return; }
      const sub = await getExistingSubscription();
      if (!cancelled) setState(sub ? "on" : "off");
    })();
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const r = await subscribeThisDevice();
      if (r === "on") { setState("on"); toast("Notifications enabled on this device.", "success"); }
      else if (r === "denied") { setState("denied"); }
      else if (r === "dismissed") { setState("off"); }
      else toast("Couldn't enable notifications.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await unsubscribeThisDevice();
      setState("off");
      toast("Notifications disabled on this device.", "success");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  if (state === "denied") {
    return (
      <button
        className="ghost small"
        title="Notifications are blocked for this site in your browser settings."
        onClick={() => toast("Notifications blocked — allow them in your site settings.", "error")}
      >
        Alerts blocked
      </button>
    );
  }

  return (
    <button
      className="ghost small"
      disabled={busy}
      title={state === "on" ? "Receive signature alerts on this device (on)" : "Receive signature alerts on this device"}
      onClick={state === "on" ? disable : enable}
    >
      {state === "on" ? "🔔 Alerts ✓" : "🔔 Alerts"}
    </button>
  );
}
