import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";

// The folder creator or an officer can manage invitations.
async function canManage(folderId: number) {
  const s = await getSession();
  if (!s) return null;
  if (s.role === "admin") return s;
  const pool = await db();
  const { rows } = await pool.query("SELECT 1 FROM folders WHERE id = $1 AND created_by = $2", [folderId, s.id]);
  return rows[0] ? s : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  if (!(await canManage(id))) return NextResponse.json({ error: "Réservé au propriétaire du dossier ou aux officiers." }, { status: 403 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT u.matricule, u.codename, u.clearance FROM folder_members fm JOIN users u ON u.id = fm.user_id
     WHERE fm.folder_id = $1 ORDER BY u.codename`,
    [id]
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const s = await canManage(id);
  if (!s) return NextResponse.json({ error: "Réservé au propriétaire du dossier ou aux officiers." }, { status: 403 });
  const { matricule } = await req.json();
  const pool = await db();
  const { rows } = await pool.query("SELECT id, codename FROM users WHERE matricule = $1 AND status = 'active'", [
    (matricule || "").trim().toUpperCase(),
  ]);
  if (!rows[0]) return NextResponse.json({ error: "Matricule inconnu ou agent inactif." }, { status: 404 });
  await pool.query("INSERT INTO folder_members (folder_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, rows[0].id]);
  const { rows: f } = await pool.query("SELECT name FROM folders WHERE id = $1", [id]);
  audit(s, "folder_invite", `${f[0]?.name || id} -> ${(matricule || "").trim().toUpperCase()}`);
  dmByUserId(
    rows[0].id,
    `🦅 **TRANSMISSION S.H.I.E.L.D.** — Un accès au dossier restreint vous a été accordé **${f[0]?.name || "?"}**. ${process.env.PORTAL_URL}/dashboard`
  );
  return NextResponse.json({ ok: true, codename: rows[0].codename });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const s = await canManage(id);
  if (!s) return NextResponse.json({ error: "Réservé au propriétaire du dossier ou aux officiers." }, { status: 403 });
  const { matricule } = await req.json();
  const pool = await db();
  await pool.query(
    "DELETE FROM folder_members WHERE folder_id = $1 AND user_id = (SELECT id FROM users WHERE matricule = $2)",
    [id, (matricule || "").trim().toUpperCase()]
  );
  audit(s, "folder_uninvite", `${id} -> ${(matricule || "").trim().toUpperCase()}`);
  return NextResponse.json({ ok: true });
}
