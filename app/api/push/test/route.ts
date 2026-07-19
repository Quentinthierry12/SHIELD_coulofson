import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";
import { pushEnabled, type PushPayload } from "@/lib/push";

// Fire a test notification at the signed-in officer, on every channel they have, and
// report back what actually went out — so Command can confirm the setup end to end.
export async function POST() {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Réservé aux officiers." }, { status: 403 });

  const pool = await db();
  const { rows: dev } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id = $1",
    [s.id]
  );
  const { rows: u } = await pool.query("SELECT discord_id FROM users WHERE id = $1", [s.id]);
  const pushDevices: number = dev[0]?.n ?? 0;
  const discordLinked = !!u[0]?.discord_id;

  // Same fan-out (Discord DM + Web Push) as every real notification. On y met des
  // boutons d'action pour que l'officier vérifie aussi Signer / Voir dans la bannière.
  const demoPush: PushPayload = {
    title: "S.H.I.E.L.D. — Test",
    body: "Notification de test. Les boutons ci-dessous ouvrent le Dispatch.",
    url: "/inbox",
    tag: "shield-test",
    actions: [
      { action: "sign", title: "Signer" },
      { action: "view", title: "Voir" },
    ],
    urls: { sign: "/inbox", view: "/inbox" },
  };
  dmByUserId(
    s.id,
    `🦅 **S.H.I.E.L.D. TEST** — Notification de test. Si tu vois ceci, le canal fonctionne. ${process.env.PORTAL_URL}/inbox`,
    demoPush
  );
  audit(s, "push_test", `push:${pushDevices} discord:${discordLinked ? "yes" : "no"}`);

  return NextResponse.json({
    ok: true,
    pushServerEnabled: pushEnabled(),
    pushDevices,
    discordLinked,
  });
}
