import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";

// Rename a folder. Creator or officer only, same rule as deletion.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const { name } = await req.json();
  const clean = String(name || "").trim();
  if (!clean) return NextResponse.json({ error: "Le nom ne peut pas être vide." }, { status: 400 });
  if (clean.length > 100) return NextResponse.json({ error: "Le nom est trop long (100 caractères max)." }, { status: 400 });
  const pool = await db();
  const { rows: fr } = await pool.query("SELECT name, created_by FROM folders WHERE id = $1", [id]);
  const folder = fr[0];
  if (!folder) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  if (s.role !== "admin" && folder.created_by !== s.id) {
    return NextResponse.json({ error: "Seul le créateur du dossier ou un officier peut le renommer." }, { status: 403 });
  }
  await pool.query("UPDATE folders SET name = $2 WHERE id = $1", [id, clean]);
  audit(s, "folder_rename", `${folder.name} -> ${clean}`);
  return NextResponse.json({ ok: true });
}

// The folder creator or an officer can delete a folder — only if it is empty
// (no sub-folders and no documents), to avoid accidental mass destruction.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const pool = await db();
  const { rows: fr } = await pool.query("SELECT name, created_by FROM folders WHERE id = $1", [id]);
  const folder = fr[0];
  if (!folder) return NextResponse.json({ error: "Dossier introuvable." }, { status: 404 });
  if (s.role !== "admin" && folder.created_by !== s.id) {
    return NextResponse.json({ error: "Seul le créateur du dossier ou un officier peut le supprimer." }, { status: 403 });
  }
  const { rows: c } = await pool.query(
    `SELECT (SELECT COUNT(*) FROM folders WHERE parent_id = $1)::int AS subfolders,
            (SELECT COUNT(*) FROM documents WHERE folder_id = $1)::int AS docs`,
    [id]
  );
  if (c[0].subfolders > 0 || c[0].docs > 0) {
    return NextResponse.json(
      { error: `Le dossier n'est pas vide (${c[0].docs} document(s), ${c[0].subfolders} sous-dossier(s)). Videz-le ou déplacez-les d'abord.` },
      { status: 409 }
    );
  }
  await pool.query("DELETE FROM folder_members WHERE folder_id = $1", [id]);
  await pool.query("DELETE FROM folders WHERE id = $1", [id]);
  audit(s, "folder_delete", folder.name);
  return NextResponse.json({ ok: true });
}
