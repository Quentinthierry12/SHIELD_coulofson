import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";

async function ownedDoc(id: number) {
  const s = await getSession();
  if (!s) return { s: null, doc: null };
  const pool = await db();
  const { rows } = await pool.query(
    "SELECT * FROM documents WHERE id = $1 AND (owner_id = $2 OR $3 = 'admin')",
    [id, s.id, s.role]
  );
  return { s, doc: rows[0] || null };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const { s, doc } = await ownedDoc(id);
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!doc) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT u.matricule, u.codename FROM document_shares ds JOIN users u ON u.id = ds.user_id WHERE ds.doc_id = $1`,
    [id]
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const { s, doc } = await ownedDoc(id);
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!doc) return NextResponse.json({ error: "Only the document owner or an officer can share it." }, { status: 403 });
  const { matricule } = await req.json();
  const pool = await db();
  const { rows } = await pool.query("SELECT id, codename FROM users WHERE matricule = $1 AND status = 'active'", [
    (matricule || "").trim().toUpperCase(),
  ]);
  if (!rows[0]) return NextResponse.json({ error: "Unknown badge number or inactive agent." }, { status: 404 });
  await pool.query("INSERT INTO document_shares (doc_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [id, rows[0].id]);
  dmByUserId(
    rows[0].id,
    `🦅 **S.H.I.E.L.D. TRANSMISSION** — Agent **${s.codename}** granted you access to classified document **« ${doc.title} »**. Open: ${process.env.PORTAL_URL}/doc/${id}`
  );
  return NextResponse.json({ ok: true, codename: rows[0].codename });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const { s, doc } = await ownedDoc(id);
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!doc) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const { matricule } = await req.json();
  const pool = await db();
  await pool.query(
    `DELETE FROM document_shares WHERE doc_id = $1 AND user_id = (SELECT id FROM users WHERE matricule = $2)`,
    [id, (matricule || "").trim().toUpperCase()]
  );
  return NextResponse.json({ ok: true });
}
