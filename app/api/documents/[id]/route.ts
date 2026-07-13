import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";

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
