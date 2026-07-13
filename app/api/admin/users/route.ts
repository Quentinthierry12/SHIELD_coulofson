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

// Création directe d'un compte agent par un officier (actif immédiatement, sans validation).
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const { codename, password, clearance, role } = await req.json();
  if (!codename?.trim() || !password || password.length < 6) {
    return NextResponse.json({ error: "Nom de code requis et mot de passe de 6 caractères minimum." }, { status: 400 });
  }
  const pool = await db();
  const hash = await bcrypt.hash(password, 10);
  for (let i = 0; i < 5; i++) {
    const matricule = "AG-" + Math.floor(1000 + Math.random() * 9000);
    try {
      await pool.query(
        `INSERT INTO users (matricule, codename, password_hash, clearance, role, status)
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [matricule, codename.trim(), hash, Math.min(10, Math.max(1, clearance || 1)), role === "admin" ? "admin" : "agent"]
      );
      return NextResponse.json({ matricule });
    } catch (e: any) {
      if (e.code !== "23505") throw e;
    }
  }
  return NextResponse.json({ error: "Réessayez." }, { status: 500 });
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
