import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";

// Divisions are real teams: a name, a lead, a shared folder, and members (users.division_id).
// Readable by any signed-in agent (the roster is public internally); only officers change them.
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.lead_id, d.folder_id,
            f.name AS folder_name,
            l.matricule AS lead_matricule, l.codename AS lead_codename,
            (SELECT COUNT(*) FROM users u WHERE u.division_id = d.id AND u.status = 'active')::int AS members
       FROM divisions d
       LEFT JOIN users l ON l.id = d.lead_id
       LEFT JOIN folders f ON f.id = d.folder_id
      ORDER BY d.name`
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Officers only." }, { status: 403 });
  const { name } = await req.json();
  const clean = String(name || "").trim();
  if (!clean) return NextResponse.json({ error: "Division name is required." }, { status: 400 });
  const pool = await db();
  try {
    const { rows } = await pool.query("INSERT INTO divisions (name) VALUES ($1) RETURNING id", [clean]);
    audit(s, "division_create", clean);
    return NextResponse.json({ id: rows[0].id });
  } catch (e: any) {
    if (e.code === "23505") return NextResponse.json({ error: "That division already exists." }, { status: 409 });
    throw e;
  }
}

export async function PATCH(req: Request) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Officers only." }, { status: 403 });
  const { id, name, lead_id, create_folder } = await req.json();
  const pool = await db();
  const { rows: cur } = await pool.query("SELECT * FROM divisions WHERE id = $1", [id]);
  const div = cur[0];
  if (!div) return NextResponse.json({ error: "Unknown division." }, { status: 404 });

  if (name !== undefined) {
    const clean = String(name).trim();
    if (!clean) return NextResponse.json({ error: "Division name cannot be empty." }, { status: 400 });
    try {
      await pool.query("UPDATE divisions SET name = $2 WHERE id = $1", [id, clean]);
    } catch (e: any) {
      if (e.code === "23505") return NextResponse.json({ error: "That division already exists." }, { status: 409 });
      throw e;
    }
    audit(s, "division_rename", `${div.name} -> ${clean}`);
  }

  if (lead_id !== undefined) {
    const lead = lead_id ? parseInt(String(lead_id), 10) : null;
    if (lead) {
      // The lead must actually belong to the division — otherwise the roster would show a
      // lead who is not on the team.
      const { rows: u } = await pool.query("SELECT division_id, codename FROM users WHERE id = $1", [lead]);
      if (!u[0]) return NextResponse.json({ error: "Unknown agent." }, { status: 404 });
      if (u[0].division_id !== id) {
        return NextResponse.json({ error: "The lead must be a member of this division." }, { status: 400 });
      }
      dmByUserId(lead, `🦅 **S.H.I.E.L.D. TRANSMISSION** — You are now **division lead** of ${div.name}.`);
    }
    await pool.query("UPDATE divisions SET lead_id = $2 WHERE id = $1", [id, lead]);
    audit(s, "division_lead", `${div.name} -> ${lead ?? "none"}`);
  }

  // Shared folder: created once, then every active member is added to it. Members added
  // later are picked up by calling this again — cheaper than a trigger on users.
  if (create_folder) {
    let folderId: number = div.folder_id;
    if (!folderId) {
      const { rows: f } = await pool.query(
        "INSERT INTO folders (name, created_by) VALUES ($1, $2) RETURNING id",
        [`${div.name} — Division`, s.id]
      );
      folderId = f[0].id;
      await pool.query("UPDATE divisions SET folder_id = $2 WHERE id = $1", [id, folderId]);
    }
    await pool.query(
      `INSERT INTO folder_members (folder_id, user_id)
       SELECT $1, u.id FROM users u WHERE u.division_id = $2 AND u.status = 'active'
       ON CONFLICT DO NOTHING`,
      [folderId, id]
    );
    audit(s, "division_folder", `${div.name} -> folder #${folderId}`);
  }

  return NextResponse.json({ ok: true });
}
