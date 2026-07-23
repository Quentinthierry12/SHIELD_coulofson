import { NextResponse } from "next/server";
import { db, getAccessibleDoc } from "@/lib/db";
import { getSession } from "@/lib/session";

// Feeds the "@" mention autocomplete inside a document's comments. Returns active agents as
// OnlyOffice user objects; `email` carries the badge so a mention maps back to an account.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const doc = await getAccessibleDoc(id, s.clearance, s.id, s.role);
  if (!doc) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const pool = await db();
  const { rows } = await pool.query(
    "SELECT id, matricule, codename FROM users WHERE status = 'active' ORDER BY codename"
  );
  // The "email" field is the identifier the editor hands back on a mention. OnlyOffice can
  // reject a value that doesn't look like an email, so we wrap the badge in a pseudo-address
  // (never actually emailed) and unwrap it in the mention endpoint.
  return NextResponse.json(
    rows.map((u: { id: number; matricule: string; codename: string }) => ({
      id: String(u.id),
      name: `${u.matricule} · ${u.codename}`,
      email: `${u.matricule}@agents.shield`,
    }))
  );
}
