import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";

// The folder creator or an officer can delete a folder — only if it is empty
// (no sub-folders and no documents), to avoid accidental mass destruction.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const pool = await db();
  const { rows: fr } = await pool.query("SELECT name, created_by FROM folders WHERE id = $1", [id]);
  const folder = fr[0];
  if (!folder) return NextResponse.json({ error: "Folder not found." }, { status: 404 });
  if (s.role !== "admin" && folder.created_by !== s.id) {
    return NextResponse.json({ error: "Only the folder creator or an officer can delete it." }, { status: 403 });
  }
  const { rows: c } = await pool.query(
    `SELECT (SELECT COUNT(*) FROM folders WHERE parent_id = $1)::int AS subfolders,
            (SELECT COUNT(*) FROM documents WHERE folder_id = $1)::int AS docs`,
    [id]
  );
  if (c[0].subfolders > 0 || c[0].docs > 0) {
    return NextResponse.json(
      { error: `Folder is not empty (${c[0].docs} document(s), ${c[0].subfolders} sub-folder(s)). Empty or move them first.` },
      { status: 409 }
    );
  }
  await pool.query("DELETE FROM folder_members WHERE folder_id = $1", [id]);
  await pool.query("DELETE FROM folders WHERE id = $1", [id]);
  audit(s, "folder_delete", folder.name);
  return NextResponse.json({ ok: true });
}
