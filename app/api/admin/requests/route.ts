import { NextResponse } from "next/server";
import { dmPrefix } from "@/lib/brand";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";

// Pending access requests an officer (or a document owner) may act on.
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT ar.id, ar.doc_id, ar.reason, ar.status, ar.created_at,
            d.title, d.classification, d.owner_id,
            u.matricule, u.codename, u.clearance
     FROM access_requests ar
     JOIN documents d ON d.id = ar.doc_id
     JOIN users u ON u.id = ar.user_id
     WHERE ar.status = 'pending' AND ($1 = 'admin' OR d.owner_id = $2)
     ORDER BY ar.created_at DESC`,
    [s.role, s.id]
  );
  return NextResponse.json(rows);
}

// Approve → grant an explicit share (this is what keeps clearance and folder
// permissions in sync: a share overrides both). Deny → just mark it.
export async function PATCH(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { id, approve } = await req.json();
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT ar.id, ar.doc_id, ar.user_id, d.title, d.owner_id
     FROM access_requests ar JOIN documents d ON d.id = ar.doc_id WHERE ar.id = $1`,
    [id]
  );
  const r = rows[0];
  if (!r) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
  if (s.role !== "admin" && r.owner_id !== s.id) {
    return NextResponse.json({ error: "Only the document owner or an officer can decide." }, { status: 403 });
  }

  if (approve) {
    await pool.query("INSERT INTO document_shares (doc_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [r.doc_id, r.user_id]);
    dmByUserId(r.user_id, `${dmPrefix()} — Your access request for **“${r.title}”** was **approved**. ${process.env.PORTAL_URL}/doc/${r.doc_id}`);
  } else {
    dmByUserId(r.user_id, `${dmPrefix()} — Your access request for **“${r.title}”** was **denied**.`);
  }
  await pool.query("UPDATE access_requests SET status = $2, decided_by = $3, decided_at = now() WHERE id = $1", [
    id, approve ? "approved" : "denied", s.id,
  ]);
  audit(s, approve ? "access_granted" : "access_denied", `#${r.doc_id} ${r.title}`);
  return NextResponse.json({ ok: true });
}
