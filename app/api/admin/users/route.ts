import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, createPersonnelFile, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";

const MATRICULE_RE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;

async function requireAdmin() {
  const s = await getSession();
  return s?.role === "admin" ? s : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const pool = await db();
  const { rows } = await pool.query(
    "SELECT id, matricule, codename, clearance, role, status, discord_id IS NOT NULL AS discord_linked, created_at FROM users ORDER BY status DESC, id"
  );
  return NextResponse.json(rows);
}

// Direct account creation by an officer (active immediately, no vetting step).
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const { codename, password, clearance, role, matricule } = await req.json();
  if (!codename?.trim() || !password || password.length < 6) {
    return NextResponse.json({ error: "Codename required and password must be at least 6 characters." }, { status: 400 });
  }
  const custom = (matricule || "").trim().toUpperCase();
  if (custom && !MATRICULE_RE.test(custom)) {
    return NextResponse.json({ error: "Badge number: 3-20 characters, letters/digits/dashes only." }, { status: 400 });
  }
  const pool = await db();
  const hash = await bcrypt.hash(password, 10);
  for (let i = 0; i < 5; i++) {
    const m = custom || "AG-" + Math.floor(1000 + Math.random() * 9000);
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (matricule, codename, password_hash, clearance, role, status, must_change_password)
         VALUES ($1, $2, $3, $4, $5, 'active', true) RETURNING id`,
        [m, codename.trim(), hash, Math.min(10, Math.max(1, clearance || 1)), role === "admin" ? "admin" : "agent"]
      );
      await createPersonnelFile(rows[0].id, m, codename.trim());
      audit(admin, "account_create", `${m} (${codename.trim()}, lvl ${Math.min(10, Math.max(1, clearance || 1))})`);
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
  const { id, status, clearance, role, new_password } = await req.json();
  if (id === admin.id && (status !== "active" || role !== "admin")) {
    return NextResponse.json({ error: "You cannot demote yourself." }, { status: 400 });
  }
  const pool = await db();
  const { rows: before } = await pool.query("SELECT status FROM users WHERE id = $1", [id]);
  await pool.query(
    "UPDATE users SET status = $2, clearance = $3, role = $4 WHERE id = $1",
    [id, status, Math.min(10, Math.max(1, clearance)), role === "admin" ? "admin" : "agent"]
  );
  if (new_password) {
    if (new_password.length < 6) return NextResponse.json({ error: "Password: at least 6 characters." }, { status: 400 });
    await pool.query("UPDATE users SET password_hash = $2, must_change_password = true WHERE id = $1", [id, await bcrypt.hash(new_password, 10)]);
    audit(admin, "password_reset", `user #${id}`);
  }
  audit(admin, "account_update", `user #${id} status=${status} clearance=${clearance} role=${role}`);
  if (before[0]?.status !== "active" && status === "active") {
    dmByUserId(id, "🦅 **S.H.I.E.L.D. TRANSMISSION** — Your clearance has been **activated**. Welcome aboard, agent. Report to https://shield.quentinthierry.fr");
  }
  return NextResponse.json({ ok: true });
}
