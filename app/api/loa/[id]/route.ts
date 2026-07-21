import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";

// Cancel a leave of absence. An agent can cancel their own; an officer can cancel anyone's.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const pool = await db();
  const { rowCount } = await pool.query(
    "UPDATE loa SET status = 'cancelled' WHERE id = $1 AND status = 'active' AND (user_id = $2 OR $3 = 'admin')",
    [id, s.id, s.role]
  );
  if (!rowCount) return NextResponse.json({ error: "Leave not found." }, { status: 404 });
  audit(s, "loa_cancel", `loa #${id}`);
  return NextResponse.json({ ok: true });
}
