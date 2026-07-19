import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";

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

// Current public-link state.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const { s, doc } = await ownedDoc(id);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (!doc) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  return NextResponse.json({ token: doc.public_token || null });
}

// Enable a public read-only link (owner or officer). Classified [[CLR:N]] sections
// stay hidden for public viewers (served at clearance 0).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const { s, doc } = await ownedDoc(id);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (!doc) return NextResponse.json({ error: "Seul le propriétaire du document ou un officier peut le partager publiquement." }, { status: 403 });
  const token = doc.public_token || randomBytes(12).toString("hex");
  const pool = await db();
  await pool.query("UPDATE documents SET public_token = $2 WHERE id = $1", [id, token]);
  audit(s, "doc_public_on", `#${id} ${doc.title}`);
  return NextResponse.json({ token });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const { s, doc } = await ownedDoc(id);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (!doc) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const pool = await db();
  await pool.query("UPDATE documents SET public_token = NULL WHERE id = $1", [id]);
  audit(s, "doc_public_off", `#${id} ${doc.title}`);
  return NextResponse.json({ ok: true });
}
