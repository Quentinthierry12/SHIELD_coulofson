import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

async function requireAdmin() {
  const s = await getSession();
  return s?.role === "admin" ? s : null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Réservé aux officiers." }, { status: 403 });
  const id = parseInt((await params).id, 10);
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT u.matricule, u.codename, u.clearance FROM folder_members fm JOIN users u ON u.id = fm.user_id
     WHERE fm.folder_id = $1 ORDER BY u.codename`,
    [id]
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Réservé aux officiers." }, { status: 403 });
  const id = parseInt((await params).id, 10);
  const { matricule } = await req.json();
  const pool = await db();
  const { rows } = await pool.query("SELECT id, codename FROM users WHERE matricule = $1 AND status = 'active'", [
    (matricule || "").trim().toUpperCase(),
  ]);
  if (!rows[0]) return NextResponse.json({ error: "Matricule inconnu ou agent inactif." }, { status: 404 });
  await pool.query("INSERT INTO folder_members (folder_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, rows[0].id]);
  return NextResponse.json({ ok: true, codename: rows[0].codename });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Réservé aux officiers." }, { status: 403 });
  const id = parseInt((await params).id, 10);
  const { matricule } = await req.json();
  const pool = await db();
  await pool.query(
    "DELETE FROM folder_members WHERE folder_id = $1 AND user_id = (SELECT id FROM users WHERE matricule = $2)",
    [id, (matricule || "").trim().toUpperCase()]
  );
  return NextResponse.json({ ok: true });
}
