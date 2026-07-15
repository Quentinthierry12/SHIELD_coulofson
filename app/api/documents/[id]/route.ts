import { NextResponse } from "next/server";
import { db, audit, accessibleFolderIds } from "@/lib/db";
import { getSession } from "@/lib/session";

// Move a document to another folder (drag & drop) and/or change its classification.
// Owner or officer only. Both fields are optional: absent means "leave alone".
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const { folder_id, classification } = await req.json();
  const pool = await db();

  if (classification !== undefined) {
    const level = Math.min(10, Math.max(1, parseInt(String(classification), 10) || 1));
    // You cannot classify above your own clearance — that would hide the document from
    // yourself, and let an agent lock a file away above the officers who vetted them.
    if (level > s.clearance) {
      return NextResponse.json(
        { error: `You can only classify up to your own clearance (level ${s.clearance}).` },
        { status: 403 }
      );
    }
    const { rows } = await pool.query(
      "UPDATE documents SET classification = $2 WHERE id = $1 AND (owner_id = $3 OR $4 = 'admin') RETURNING title, classification",
      [id, level, s.id, s.role]
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "Only the document owner or an officer can reclassify it." }, { status: 403 });
    }
    audit(s, "doc_classify", `#${id} ${rows[0].title} -> lvl ${level}`);
  }

  if (folder_id !== undefined) {
    const target = folder_id ? parseInt(folder_id, 10) : null;
    // Destination must be a folder the agent can access (or the Drive root).
    if (target !== null) {
      const ids = await accessibleFolderIds(s.id, s.role);
      if (!ids.includes(target)) return NextResponse.json({ error: "You cannot move it there." }, { status: 403 });
    }
    const { rows } = await pool.query(
      "UPDATE documents SET folder_id = $2 WHERE id = $1 AND (owner_id = $3 OR $4 = 'admin') RETURNING title",
      [id, target, s.id, s.role]
    );
    if (!rows[0]) return NextResponse.json({ error: "Only the document owner or an officer can move it." }, { status: 403 });
    audit(s, "doc_move", `#${id} -> folder ${target ?? "root"}`);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const pool = await db();
  const { rows } = await pool.query(
    "DELETE FROM documents WHERE id = $1 AND (owner_id = $2 OR $3 = 'admin') RETURNING title",
    [id, s.id, s.role]
  );
  if (!rows[0]) return NextResponse.json({ error: "Only the document owner or an officer can destroy it." }, { status: 403 });
  await pool.query("DELETE FROM document_shares WHERE doc_id = $1", [id]);
  audit(s, "doc_destroy", `#${id} ${rows[0].title}`);
  return NextResponse.json({ ok: true });
}
