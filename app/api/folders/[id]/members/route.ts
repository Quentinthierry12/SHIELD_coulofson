import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";
import { folderRole, atLeast, normalizeRole, type Role } from "@/lib/permissions";

// Gérer les invitations d'un dossier exige le rôle Gestionnaire (créateur, officier, ou
// partage Gestionnaire hérité).
async function canManage(folderId: number) {
  const s = await getSession();
  if (!s) return null;
  return atLeast(await folderRole(folderId, s), "manager") ? s : null;
}

const ROLE_FR: Record<Role, string> = { viewer: "view", editor: "edit", manager: "manage" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  if (!(await canManage(id))) return NextResponse.json({ error: "Manager role required for this folder." }, { status: 403 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT u.matricule, u.codename, u.clearance, fm.role FROM folder_members fm JOIN users u ON u.id = fm.user_id
     WHERE fm.folder_id = $1 ORDER BY u.codename`,
    [id]
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const s = await canManage(id);
  if (!s) return NextResponse.json({ error: "Manager role required for this folder." }, { status: 403 });
  const { matricule, role } = await req.json();
  const r = normalizeRole(role);
  const pool = await db();
  const { rows } = await pool.query("SELECT id, codename FROM users WHERE matricule = $1 AND status = 'active'", [
    (matricule || "").trim().toUpperCase(),
  ]);
  if (!rows[0]) return NextResponse.json({ error: "Matricule inconnu ou agent inactif." }, { status: 404 });
  await pool.query(
    "INSERT INTO folder_members (folder_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (folder_id, user_id) DO UPDATE SET role = EXCLUDED.role",
    [id, rows[0].id, r]
  );
  const { rows: f } = await pool.query("SELECT name FROM folders WHERE id = $1", [id]);
  audit(s, "folder_invite", `${f[0]?.name || id} -> ${(matricule || "").trim().toUpperCase()} (${r})`);
  dmByUserId(
    rows[0].id,
    `🦅 **S.H.I.E.L.D. TRANSMISSION** — You were granted access (**${ROLE_FR[r]}**) to the restricted folder **${f[0]?.name || "?"}**. ${process.env.PORTAL_URL}/dashboard`
  );
  return NextResponse.json({ ok: true, codename: rows[0].codename, role: r });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const s = await canManage(id);
  if (!s) return NextResponse.json({ error: "Manager role required for this folder." }, { status: 403 });
  const { matricule } = await req.json();
  const pool = await db();
  await pool.query(
    "DELETE FROM folder_members WHERE folder_id = $1 AND user_id = (SELECT id FROM users WHERE matricule = $2)",
    [id, (matricule || "").trim().toUpperCase()]
  );
  audit(s, "folder_uninvite", `${id} -> ${(matricule || "").trim().toUpperCase()}`);
  return NextResponse.json({ ok: true });
}
