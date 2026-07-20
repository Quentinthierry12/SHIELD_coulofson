import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { buildDocx, fillVariables, systemValues } from "@/lib/docxgen";

// Create a document from a template — available to any signed-in agent (the template library
// is reusable, not just readable). The new document is owned by the agent and capped to their
// own clearance, exactly like creating a blank document.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const { title, classification, folder_id, vars } = await req.json();
  if (!title?.trim()) return NextResponse.json({ error: "Title required." }, { status: 400 });
  const pool = await db();
  const { rows: t } = await pool.query("SELECT filetype, content, body FROM templates WHERE id = $1", [id]);
  if (!t[0]) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  const level = Math.min(Math.max(1, classification || 1), s.clearance);
  const content: Buffer = t[0].body != null
    ? await buildDocx(fillVariables(t[0].body, { ...(vars || {}), ...systemValues(s) }))
    : t[0].content;
  const filetype = t[0].body != null ? "docx" : t[0].filetype;
  const { rows } = await pool.query(
    `INSERT INTO documents (title, filetype, classification, owner_id, content, folder_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [title.trim(), filetype, level, s.id, content, folder_id || null]
  );
  audit(s, "doc_from_template", `#${rows[0].id} ${title.trim()}`);
  return NextResponse.json({ id: rows[0].id });
}
