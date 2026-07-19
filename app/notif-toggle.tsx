"use client";
import { useEffect, useState } from "react";
import { toast } from "@/lib/ui-store";

// VAPID keys are URL-safe base64; the browser wants the raw bytes.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "off" | "on" | "denied";

// A single button in the topbar that turns PWA push notifications on/off for this device.
// Hidden entirely when the server has no VAPID keys, or the browser can't do push.
export default function NotifToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  useEffect(() => {
    if (!supported) { setState("unsupported"); return; }
    let cancelled = false;
    (async () => {
      // Server-side switch: no VAPID key → the whole feature stays invisible.
      const cfg = await fetch("/api/push/subscribe").then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (cancelled) return;
      if (!cfg?.enabled) { setState("unsupported"); return; }
      if (Notification.permission === "denied") { setState("denied"); return; }
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!cancelled) setState(sub ? "on" : "off");
    })();
    return () => { cancelled = true; };
  }, [supported]);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const cfg = await fetch("/api/push/subscribe").then((r) => r.json());
      if (!cfg?.key) { toast("Notifications indisponibles sur ce serveur.", "error"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.key),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error("subscribe failed");
      setState("on");
      toast("Notifications activées sur cet appareil.", "success");
    } catch {
      toast("Impossible d'activer les notifications.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
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
