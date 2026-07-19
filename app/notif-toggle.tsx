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
      if (r === "on") { setState("on"); toast("Notifications activées sur cet appareil.", "success"); }
      else if (r === "denied") { setState("denied"); }
      else if (r === "dismissed") { setState("off"); }
      else toast("Impossible d'activer les notifications.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      await unsubscribeThisDevice();
      setState("off");
      toast("Notifications désactivées sur cet appareil.", "success");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") return null;

  if (state === "denied") {
    return (
      <button
        className="ghost small"
        title="Les notifications sont bloquées dans les réglages du navigateur pour ce site."
        onClick={() => toast("Notifications bloquées — autorisez-les dans les réglages du site.", "error")}
      >
        Notifs bloquées
      </button>
    );
  }

  return (
    <button
      className="ghost small"
      disabled={busy}
      title={state === "on" ? "Recevoir les alertes de signature sur cet appareil (activé)" : "Recevoir les alertes de signature sur cet appareil"}
      onClick={state === "on" ? disable : enable}
    >
      {state === "on" ? "🔔 Notifs ✓" : "🔔 Notifs"}
    </button>
  );
}
