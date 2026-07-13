import { NextResponse } from "next/server";
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
  const { id, status, clearance, role } = await req.json();
  if (id === admin.id && (status !== "active" || role !== "admin")) {
    return NextResponse.json({ error: "Impossible de se rétrograder soi-même." }, { status: 400 });
  }
  const pool = await db();
  await pool.query(
    "UPDATE users SET status = $2, clearance = $3, role = $4 WHERE id = $1",
    [id, status, Math.min(10, Math.max(1, clearance)), role === "admin" ? "admin" : "agent"]
  );
  return NextResponse.json({ ok: true });
}
