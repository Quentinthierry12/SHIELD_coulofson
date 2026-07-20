import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { pushEnabled, vapidPublicKey, saveSubscription, removeSubscription } from "@/lib/push";

// The browser needs the VAPID public key to create a subscription. Safe to hand out.
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!pushEnabled()) return NextResponse.json({ enabled: false });
  return NextResponse.json({ enabled: true, key: vapidPublicKey() });
}

// Register this device for the signed-in agent.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!pushEnabled()) return NextResponse.json({ error: "Push is not configured on this server." }, { status: 503 });
  const sub = await req.json().catch(() => null);
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: "Abonnement invalide." }, { status: 400 });
  }
  await saveSubscription(s.id, sub);
  return NextResponse.json({ ok: true });
}

// Unregister this device (agent turned notifications off, or the browser revoked us).
export async function DELETE(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body?.endpoint) await removeSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
