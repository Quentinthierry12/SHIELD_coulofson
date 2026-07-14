import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const id = parseInt((await params).id, 10);
  if (id === s.id) return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  const pool = await db();
  const { rows } = await pool.query("SELECT matricule, codename, clearance FROM users WHERE id = $1", [id]);
  const target = rows[0];
  if (!target) return NextResponse.json({ error: "Unknown agent." }, { status: 404 });
  if (target.clearance >= s.clearance) {
    return NextResponse.json({ error: "You cannot delete an agent at or above your own clearance." }, { status: 403 });
  }
  // Keep the agent's documents (orphaned), drop their access rows, then remove the account.
  await pool.query("UPDATE documents SET owner_id = NULL WHERE owner_id = $1", [id]);
  await pool.query("UPDATE folders SET created_by = NULL WHERE created_by = $1", [id]);
  await pool.query("DELETE FROM document_shares WHERE user_id = $1", [id]);
  await pool.query("DELETE FROM folder_members WHERE user_id = $1", [id]);
  await pool.query("DELETE FROM users WHERE id = $1", [id]);
  audit(s, "account_delete", `${target.matricule} (${target.codename})`);
  return NextResponse.json({ ok: true });
}
