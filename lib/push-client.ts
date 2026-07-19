"use client";
// Client-side Web Push helpers, shared by the 🔔 toggle and the first-launch invite.
// Kept in one place so both trigger the exact same subscribe flow.

// VAPID keys are URL-safe base64; the browser wants the raw bytes.
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export type PushConfig = { enabled: boolean; key?: string };

// Server switch + public key. Returns null when not signed in (401) or on error,
// so callers treat "unknown" the same as "off" and simply stay hidden.
export async function getPushConfig(): Promise<PushConfig | null> {
  try {
    const r = await fetch("/api/push/subscribe");
    if (!r.ok) return null;
    return (await r.json()) as PushConfig;
  } catch {
    return null;
  }
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  return reg ? reg.pushManager.getSubscription() : null;
}

export type SubscribeResult = "on" | "denied" | "dismissed" | "error";

// Request permission (must be called from a user gesture) and register this device
// for the signed-in agent. Returns a coarse outcome the caller turns into UI.
export async function subscribeThisDevice(): Promise<SubscribeResult> {
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return perm === "denied" ? "denied" : "dismissed";
    const cfg = await getPushConfig();
    if (!cfg?.enabled || !cfg.key) return "error";
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
    return res.ok ? "on" : "error";
  } catch {
    return "error";
  }
}

// Drop this device's subscription (agent turned notifications off).
export async function unsubscribeThisDevice(): Promise<void> {
  const sub = await getExistingSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
