import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

async function requireAdmin() {
  const s = await getSession();
  return s?.role === "admin" ? s : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const pool = await db();
  const { rows } = await pool.query(
    "SELECT id, matricule, codename, clearance, role, status, created_at FROM users ORDER BY status DESC, id"
  );
  return NextResponse.json(rows);
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const { id, status, clearance, role, new_password } = await req.json();
  if (id === admin.id && (status !== "active" || role !== "admin")) {
    return NextResponse.json({ error: "Impossible de se rétrograder soi-même." }, { status: 400 });
  }
  const pool = await db();
  await pool.query(
    "UPDATE users SET status = $2, clearance = $3, role = $4 WHERE id = $1",
    [id, status, Math.min(10, Math.max(1, clearance)), role === "admin" ? "admin" : "agent"]
  );
  if (new_password) {
    if (new_password.length < 6) return NextResponse.json({ error: "Mot de passe : 6 caractères minimum." }, { status: 400 });
    await pool.query("UPDATE users SET password_hash = $2 WHERE id = $1", [id, await bcrypt.hash(new_password, 10)]);
  }
  return NextResponse.json({ ok: true });
}
