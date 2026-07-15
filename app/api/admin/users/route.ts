import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, createPersonnelFile, refreshPersonnelFile, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";
import { syncMoodleUser, setMoodlePassword } from "@/lib/moodle";

const MATRICULE_RE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;

async function requireAdmin() {
  const s = await getSession();
  return s?.role === "admin" ? s : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT id, matricule, codename, clearance, role, status, COALESCE(division,'') AS division,
            discord_id IS NOT NULL AS discord_linked,
            moodle_id IS NOT NULL AS moodle_synced,
            created_at
     FROM users ORDER BY status DESC, id`
  );
  return NextResponse.json(rows);
}

// Direct account creation by an officer (active immediately, no vetting step).
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const { codename, password, clearance, role, matricule, division } = await req.json();
  if (!codename?.trim() || !password || password.length < 6) {
    return NextResponse.json({ error: "Codename required and password must be at least 6 characters." }, { status: 400 });
  }
  const custom = (matricule || "").trim().toUpperCase();
  if (custom && !MATRICULE_RE.test(custom)) {
    return NextResponse.json({ error: "Badge number: 3-20 characters, letters/digits/dashes only." }, { status: 400 });
  }
  const level = Math.min(10, Math.max(1, clearance || 1));
  // An officer may only create accounts at a clearance strictly below their own.
  if (level >= admin.clearance) {
    return NextResponse.json({ error: `You can only create accounts below your own clearance (max level ${admin.clearance - 1}).` }, { status: 403 });
  }
  const pool = await db();
  const hash = await bcrypt.hash(password, 10);
  for (let i = 0; i < 5; i++) {
    const m = custom || "AG-" + Math.floor(1000 + Math.random() * 9000);
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (matricule, codename, password_hash, clearance, role, status, must_change_password, division)
         VALUES ($1, $2, $3, $4, $5, 'active', true, $6) RETURNING id`,
        [m, codename.trim(), hash, level, role === "admin" ? "admin" : "agent", (division || "").trim() || null]
      );
      await createPersonnelFile(rows[0].id, m, codename.trim(), (division || "").trim(), level);
      await syncMoodleUser(rows[0].id, { matricule: m, codename: codename.trim(), division, suspended: false }, password);
      audit(admin, "account_create", `${m} (${codename.trim()}, lvl ${level})`);
      return NextResponse.json({ matricule: m });
    } catch (e: any) {
      if (e.code !== "23505") throw e;
      if (custom) return NextResponse.json({ error: "This badge number is already taken." }, { status: 409 });
    }
  }
  return NextResponse.json({ error: "Please try again." }, { status: 500 });
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const { id, status, clearance, role, new_password, division, matricule, codename } = await req.json();
  if (id === admin.id && (status !== "active" || role !== "admin")) {
    return NextResponse.json({ error: "You cannot demote yourself." }, { status: 400 });
  }
  const pool = await db();
  const { rows: before } = await pool.query("SELECT status, clearance, matricule, codename FROM users WHERE id = $1", [id]);
  if (!before[0]) return NextResponse.json({ error: "Unknown agent." }, { status: 404 });
  const level = Math.min(10, Math.max(1, clearance));
  // Officers can neither manage agents at/above their own clearance nor raise anyone to it.
  if (id !== admin.id && before[0].clearance >= admin.clearance) {
    return NextResponse.json({ error: "You cannot manage an agent at or above your own clearance." }, { status: 403 });
  }
  if (id !== admin.id && level >= admin.clearance) {
    return NextResponse.json({ error: `You can only assign clearances below your own (max level ${admin.clearance - 1}).` }, { status: 403 });
  }
  // Badge and codename are editable; the badge is the sign-in name, so validate it and
  // keep it unique. Both are optional in the payload — absent means "leave alone".
  const newBadge = matricule === undefined ? before[0].matricule : String(matricule).trim().toUpperCase();
  const newCodename = codename === undefined ? before[0].codename : String(codename).trim();
  if (!MATRICULE_RE.test(newBadge)) {
    return NextResponse.json({ error: "Badge number: 3-20 characters, letters/digits/dashes only." }, { status: 400 });
  }
  if (!newCodename) return NextResponse.json({ error: "Codename cannot be empty." }, { status: 400 });
  const renamed = newBadge !== before[0].matricule || newCodename !== before[0].codename;
  try {
    await pool.query(
      "UPDATE users SET status = $2, clearance = $3, role = $4, division = $5, matricule = $6, codename = $7 WHERE id = $1",
      [id, status, level, role === "admin" ? "admin" : "agent", (division || "").trim() || null, newBadge, newCodename]
    );
  } catch (e: any) {
    if (e.code === "23505") return NextResponse.json({ error: "This badge number is already taken." }, { status: 409 });
    throw e;
  }
  if (renamed) audit(admin, "account_rename", `#${id} ${before[0].matricule} (${before[0].codename}) -> ${newBadge} (${newCodename})`);
  if (new_password) {
    if (new_password.length < 6) return NextResponse.json({ error: "Password: at least 6 characters." }, { status: 400 });
    await pool.query("UPDATE users SET password_hash = $2, must_change_password = true WHERE id = $1", [id, await bcrypt.hash(new_password, 10)]);
    await setMoodlePassword(id, new_password);
    audit(admin, "password_reset", `user #${id}`);
  }
  audit(admin, "account_update", `user #${id} status=${status} clearance=${clearance} role=${role}`);
  // Keep the Academy account in step with status changes (unsuspend on activation, etc.).
  const { rows: cur } = await pool.query("SELECT matricule, codename, division FROM users WHERE id = $1", [id]);
  if (cur[0]) await syncMoodleUser(id, { matricule: cur[0].matricule, codename: cur[0].codename, division: cur[0].division, suspended: status !== "active" });
  if (before[0]?.status !== "active" && status === "active") {
    await refreshPersonnelFile(id); // regenerate with the clearance/division just assigned
    dmByUserId(id, "🦅 **S.H.I.E.L.D. TRANSMISSION** — Your clearance has been **activated**. Welcome aboard, agent. Report to https://shield.quentinthierry.fr");
  } else if (renamed) {
    await refreshPersonnelFile(id); // the file embeds the badge and codename, in its title too
  }
  // The badge IS the sign-in name: changing it locks the agent out until they know.
  if (newBadge !== before[0].matricule) {
    dmByUserId(id, `🦅 **S.H.I.E.L.D. TRANSMISSION** — Your badge number is now **${newBadge}** (was ${before[0].matricule}). Use it to sign in, here and at the Academy. Your password is unchanged.`);
  }
  return NextResponse.json({ ok: true });
}
