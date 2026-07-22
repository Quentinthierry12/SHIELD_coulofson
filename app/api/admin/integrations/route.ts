import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { moodleEnabled } from "@/lib/moodle";
import { DS_URL } from "@/lib/onlyoffice";
import { pushEnabled } from "@/lib/push";

// Live status of the external systems the portal talks to. Without this, an unconfigured
// integration looks identical to "no agent has linked it yet" in the Agents table.

// A dead integration must not hang Command — fail fast and report it.
async function ping(url: string, ms = 4000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ms), cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Access denied." }, { status: 403 });

  const pool = await db();
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(discord_id)::int AS discord,
            COUNT(moodle_id)::int  AS moodle
     FROM users WHERE status = 'active'`
  );
  const counts = rows[0];

  // Web Push adoption: how many agents have enabled it, and how many devices in total.
  const { rows: pushRows } = await pool.query(
    "SELECT COUNT(DISTINCT user_id)::int AS users, COUNT(*)::int AS devices FROM push_subscriptions"
  );
  const push = pushRows[0];

  const discordConfigured = !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_BOT_TOKEN);
  const moodleConfigured = moodleEnabled();

  const [moodleUp, dsUp] = await Promise.all([
    moodleConfigured ? ping(`${process.env.MOODLE_URL}/login/index.php`) : Promise.resolve(false),
    ping(`${DS_URL()}/healthcheck`),
  ]);

  return NextResponse.json({
    total: counts.total,
    discord: { configured: discordConfigured, reachable: discordConfigured, linked: counts.discord },
    academy: { configured: moodleConfigured, reachable: moodleUp, linked: counts.moodle },
    office: { configured: true, reachable: dsUp, linked: null },
    push: { configured: pushEnabled(), reachable: pushEnabled(), linked: push.users, devices: push.devices },
  });
}
