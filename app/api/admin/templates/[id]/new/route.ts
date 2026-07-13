import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";

// Create a document from a template by copying its content.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Officers only." }, { status: 403 });
  const id = parseInt((await params).id, 10);
  const { title, classification, folder_id } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "Title required." }, { status: 400 });
  const pool = await db();
  const { rows: t } = await pool.query("SELECT filetype, content FROM templates WHERE id = $1", [id]);
  if (!t[0]) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  const level = Math.min(Math.max(1, classification || 1), s.clearance);
  const { rows } = await pool.query(
    `INSERT INTO documents (title, filetype, classification, owner_id, content, folder_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [title.trim(), t[0].filetype, level, s.id, t[0].content, folder_id || null]
  );
  audit(s, "doc_from_template", `#${rows[0].id} ${title.trim()}`);
  return NextResponse.json({ id: rows[0].id });
}
