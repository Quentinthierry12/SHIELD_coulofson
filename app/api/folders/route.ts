import { NextResponse } from "next/server";
import { db, accessibleFolders, audit } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const folders = await accessibleFolders(s.id, s.role);
  return NextResponse.json(
    folders.map((f) => ({ ...f, mine: f.created_by === s.id || s.role === "admin" }))
  );
}

// Any active agent can create a folder (they own it); officers can manage any.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { name, parent_id } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  const pool = await db();
  const { rows } = await pool.query(
    "INSERT INTO folders (name, parent_id, created_by) VALUES ($1, $2, $3) RETURNING id",
    [name.trim(), parent_id || null, s.id]
  );
  audit(s, "folder_create", name.trim());
  return NextResponse.json({ id: rows[0].id });
}
