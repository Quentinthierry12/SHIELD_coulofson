import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { DOC_TYPES } from "@/lib/onlyoffice";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT d.id, d.title, d.filetype, d.classification, d.updated_at, u.codename AS owner
     FROM documents d LEFT JOIN users u ON u.id = d.owner_id
     WHERE d.classification <= $1 ORDER BY d.updated_at DESC`,
    [s.clearance]
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { title, filetype, classification } = await req.json();
  if (!title?.trim() || !DOC_TYPES[filetype]) {
    return NextResponse.json({ error: "Titre et type requis." }, { status: 400 });
  }
  const level = Math.min(Math.max(1, classification || 1), s.clearance);
  const template = await readFile(path.join(process.cwd(), "templates", `new.${filetype}`));
  const pool = await db();
  const { rows } = await pool.query(
    `INSERT INTO documents (title, filetype, classification, owner_id, content)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [title.trim(), filetype, level, s.id, template]
  );
  return NextResponse.json({ id: rows[0].id });
}
