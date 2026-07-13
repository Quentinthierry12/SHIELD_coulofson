import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const pool = await db();
  const { rowCount } = await pool.query(
    "DELETE FROM documents WHERE id = $1 AND (owner_id = $2 OR $3 = 'admin')",
    [id, s.id, s.role]
  );
  if (!rowCount) return NextResponse.json({ error: "Seul l'agent créateur ou un officier peut détruire ce document." }, { status: 403 });
  await pool.query("DELETE FROM document_shares WHERE doc_id = $1", [id]);
  return NextResponse.json({ ok: true });
}
