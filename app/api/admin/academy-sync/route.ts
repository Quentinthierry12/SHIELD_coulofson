import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { syncMoodleUser, moodleEnabled } from "@/lib/moodle";

// Manual Academy provisioning. The automatic sync only fires when the portal has the
// plaintext password in hand (account creation, password change), so agents predating the
// Academy — or any account whose sync failed — never got one. This backfills them.
//
// Important: we store bcrypt hashes, so we cannot reuse an existing agent's portal password
// here. The account is created with a throwaway password and the agent's next portal
// password change pushes the real one across. The response says so; the UI must not claim
// the passwords match.
export async function POST(req: Request) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  if (!moodleEnabled()) {
    return NextResponse.json({ error: "L'Académie n'est pas configurée (MOODLE_URL / MOODLE_TOKEN)." }, { status: 400 });
  }

  const { id } = await req.json().catch(() => ({ id: undefined }));
  const pool = await db();
  const { rows } = await pool.query(
    id
      ? `SELECT u.id, u.matricule, u.codename, u.status, COALESCE(dv.name, '') AS division
           FROM users u LEFT JOIN divisions dv ON dv.id = u.division_id WHERE u.id = $1`
      : `SELECT u.id, u.matricule, u.codename, u.status, COALESCE(dv.name, '') AS division
           FROM users u LEFT JOIN divisions dv ON dv.id = u.division_id
          WHERE u.status = 'active' AND u.moodle_id IS NULL`,
    id ? [id] : []
  );
  if (!rows.length) {
    return NextResponse.json({ ok: true, created: 0, updated: 0, failed: 0, message: "Everyone is already provisioned." });
  }
  // An officer may not provision an agent at or above their own clearance.
  let created = 0, updated = 0, failed = 0;
  for (const u of rows) {
    const r = await syncMoodleUser(u.id, {
      matricule: u.matricule,
      codename: u.codename,
      division: u.division,
      suspended: u.status !== "active",
    });
    if (!r) failed++;
    else if (r.created) created++;
    else updated++;
  }
  audit(s, "academy_sync", id ? `user #${id}` : `${rows.length} agents (${created} created)`);
  return NextResponse.json({ ok: true, created, updated, failed, passwordSynced: false });
}
