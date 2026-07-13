import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT f.id, f.name,
            EXISTS (SELECT 1 FROM folder_members fm WHERE fm.folder_id = f.id) AS restricted
     FROM folders f
     WHERE $2 = 'admin'
        OR NOT EXISTS (SELECT 1 FROM folder_members fm WHERE fm.folder_id = f.id)
        OR EXISTS (SELECT 1 FROM folder_members fm WHERE fm.folder_id = f.id AND fm.user_id = $1)
     ORDER BY f.name`,
    [s.id, s.role]
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Officers only." }, { status: 403 });
  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name required." }, { status: 400 });
  const pool = await db();
  const { rows } = await pool.query(
    "INSERT INTO folders (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
    [name.trim()]
  );
  return NextResponse.json({ id: rows[0].id });
}
