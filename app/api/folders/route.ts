import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const pool = await db();
  const { rows } = await pool.query("SELECT id, name FROM folders ORDER BY name");
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Réservé aux officiers." }, { status: 403 });
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  const pool = await db();
  const { rows } = await pool.query(
    "INSERT INTO folders (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
    [name.trim()]
  );
  return NextResponse.json({ id: rows[0].id });
}
