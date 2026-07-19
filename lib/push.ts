import webpush from "web-push";
import { db } from "./db";

// ---- Web Push (PWA) ------------------------------------------------------
// Native browser push, no third party. We hold a VAPID key pair; the browser
// gives us a per-device subscription (endpoint + keys) that we store and ring.
//
// Generate a key pair once and put it in the environment:
//   node -e "console.log(require('web-push').generateVAPIDKeys())"
//   VAPID_PUBLIC_KEY=…  VAPID_PRIVATE_KEY=…  VAPID_SUBJECT=mailto:ops@shield…
//
// The public key is safe to hand to the browser; the private key never leaves
// the server. Everything here is fire-and-forget: a device being unreachable
// must never break the action that triggered the notification.

let configured = false;

export function pushEnabled(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function ensureConfigured() {
  if (configured || !pushEnabled()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || `mailto:ops@${(process.env.PORTAL_URL || "shield.local").replace(/^https?:\/\//, "")}`,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export type PushAction = { action: string; title: string };
export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  // Boutons affichés sous la bannière (Android/desktop ; ignorés là où non supportés,
  // ex. iOS — la notification reste cliquable normalement).
  actions?: PushAction[];
  // Cible par bouton : action → URL. Le clic simple utilise `url`.
  urls?: Record<string, string>;
};

// Payload d'une demande de signature, avec boutons Signer / Voir. Le bouton Signer
// (et le clic simple) ouvre le Dispatch ; Voir ouvre le document.
export function signatureRequestPush(docTitle: string, docId: number, headline = "Signature requise"): PushPayload {
  return {
    title: `S.H.I.E.L.D. — ${headline}`,
    body: docTitle,
    url: "/inbox",
    tag: `sig-${docId}`,
    actions: [
      { action: "sign", title: "Signer" },
      { action: "view", title: "Voir" },
    ],
    urls: { sign: "/inbox", view: `/doc/${docId}` },
  };
}

// Ring every device an agent has registered. Dead subscriptions (410 Gone /
// 404 Not Found) are pruned so we don't keep hammering a browser that revoked us.
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!pushEnabled()) return;
  ensureConfigured();
  try {
    const pool = await db();
    const { rows } = await pool.query(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
      [userId]
    );
    if (!rows.length) return;
    const body = JSON.stringify(payload);
    await Promise.all(
      rows.map(async (r: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
            body
          );
        } catch (e: unknown) {
          const code = (e as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) {
            await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [r.endpoint]).catch(() => {});
          }
        }
      })
    );
  } catch {
    /* push must never throw into the caller */
  }
}

// Save (or refresh) a device subscription for an agent.
export async function saveSubscription(
  userId: number,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  const pool = await db();
  await pool.query(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [sub.endpoint, userId, sub.keys.p256dh, sub.keys.auth]
  );
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const pool = await db();
  await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
}

// The notifications the portal sends are always short Discord-markdown strings of the
// shape "🦅 **S.H.I.E.L.D. TITLE** — body … https://url". A phone banner wants plain
// text and a target to open, so we derive them here rather than change every call site.
export function pushFromDiscordContent(content: string): PushPayload {
  const urlMatch = content.match(/https?:\/\/\S+/);
  const url = urlMatch ? urlMatch[0] : undefined;
  let text = content.replace(/https?:\/\/\S+/g, "").replace(/\*\*/g, "").trim();
  // Drop the leading eagle so the banner reads cleanly.
  text = text.replace(/^🦅\s*/, "");
  const dash = text.indexOf("—");
  let title = "S.H.I.E.L.D.";
  let body = text;
  if (dash !== -1) {
    title = text.slice(0, dash).trim() || title;
    body = text.slice(dash + 1).trim();
  }
  // Stripping the trailing URL can leave a dangling lead-in ("Full order:"); tidy it.
  body = body.replace(/\s{2,}/g, " ").replace(/[\s:–—-]+$/, "").trim();
  return { title, body, url };
}
