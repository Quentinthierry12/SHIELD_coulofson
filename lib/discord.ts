import { SignJWT, jwtVerify } from "jose";
import { db } from "./db";
import { sendPushToUser, pushFromDiscordContent, type PushPayload } from "./push";

const API = "https://discord.com/api/v10";
const secret = () => new TextEncoder().encode(process.env.APP_SECRET!);

export const discordEnabled = () =>
  !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);

const redirectUri = () => `${process.env.PORTAL_URL}/api/auth/discord/callback`;

// state = signed JWT so the callback can't be forged (mode: login or link).
// `pending` marque une liaison faite par une recrue pas encore connectée (à l'enrôlement) :
// le callback la renvoie alors vers /login plutôt que /dashboard.
export async function discordAuthUrl(mode: "login" | "link", userId?: number, pending = false) {
  const state = await new SignJWT({ mode, userId, pending })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(secret());
  const p = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "identify",
    state,
  });
  return `https://discord.com/oauth2/authorize?${p}`;
}

export async function verifyState(state: string) {
  try {
    const { payload } = await jwtVerify(state, secret());
    return payload as { mode: "login" | "link"; userId?: number; pending?: boolean };
  } catch {
    return null;
  }
}

// Jeton court remis à la recrue juste après l'enrôlement pour lui permettre de lier son
// Discord sans session (elle n'est pas encore validée, donc ne peut pas se connecter).
export async function signPendingLinkToken(userId: number) {
  return new SignJWT({ uid: userId, kind: "discord-link" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30m")
    .sign(secret());
}
export async function readPendingLinkToken(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.kind === "discord-link" ? (payload.uid as number) : null;
  } catch {
    return null;
  }
}

export async function exchangeCode(code: string): Promise<{ id: string; username: string } | null> {
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) return null;
  const { access_token } = await res.json();
  const me = await fetch(`${API}/users/@me`, { headers: { Authorization: `Bearer ${access_token}` } });
  return me.ok ? me.json() : null;
}

// Fire-and-forget DM via the bot. Never throws — Discord being down must not break the portal.
export async function sendDM(discordId: string, content: string) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || !discordId) return;
  try {
    const ch = await fetch(`${API}/users/@me/channels`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: discordId }),
    });
    if (!ch.ok) return;
    const { id } = await ch.json();
    await fetch(`${API}/channels/${id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  } catch {}
}

// Notify an agent on every channel we have. Discord DM (if they linked their account)
// and a PWA Web Push banner (on every device they enabled). Both are fire-and-forget:
// a dead channel must never break the action that triggered the notification.
// `push` overrides the banner text; omitted, it is derived from the Discord content.
export async function dmByUserId(userId: number, content: string, push?: PushPayload) {
  const pool = await db();
  const { rows } = await pool.query("SELECT discord_id FROM users WHERE id = $1", [userId]);
  if (rows[0]?.discord_id) sendDM(rows[0].discord_id, content).catch(() => {});
  sendPushToUser(userId, push ?? pushFromDiscordContent(content)).catch(() => {});
}
