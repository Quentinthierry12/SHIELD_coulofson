import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Officers only." }, { status: 403 });
  const id = parseInt((await params).id, 10);
  const pool = await db();
  const { rows } = await pool.query("DELETE FROM templates WHERE id = $1 RETURNING name", [id]);
  if (rows[0]) audit(s, "template_delete", rows[0].name);
  return NextResponse.json({ ok: true });
}
