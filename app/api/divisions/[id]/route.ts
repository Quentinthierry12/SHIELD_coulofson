import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";

// Delete a division. Refused while agents still belong to it — silently orphaning
// people is how a roster starts lying. The shared folder is left alone: it may hold
// documents, and folder deletion has its own rules.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Officers only." }, { status: 403 });
  const id = parseInt((await params).id, 10);
  const pool = await db();

  const { rows } = await pool.query("SELECT name, folder_id FROM divisions WHERE id = $1", [id]);
  if (!rows[0]) return NextResponse.json({ error: "Unknown division." }, { status: 404 });

  const { rows: c } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM users WHERE division_id = $1", [id]
  );
  if (c[0].n > 0) {
    return NextResponse.json(
      { error: `${c[0].n} agent(s) still belong to this division. Reassign them first.` },
      { status: 409 }
    );
  }

  await pool.query("DELETE FROM divisions WHERE id = $1", [id]);
  // Missions keep their history; they just lose the division label.
  await pool.query("UPDATE missions SET division_id = NULL WHERE division_id = $1", [id]);
  audit(s, "division_delete", `${rows[0].name}${rows[0].folder_id ? " (shared folder kept)" : ""}`);
  return NextResponse.json({ ok: true });
}
