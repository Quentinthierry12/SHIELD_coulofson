import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";
import { docRole, atLeast, normalizeRole, type Role } from "@/lib/permissions";

// Partager un document exige le rôle Gestionnaire (propriétaire, officier, ou partage
// Gestionnaire hérité). Renvoie le document si l'agent peut le gérer, sinon null.
async function managedDoc(id: number) {
  const s = await getSession();
  if (!s) return { s: null, doc: null };
  const pool = await db();
  const { rows } = await pool.query(
    "SELECT id, title, owner_id, folder_id, classification FROM documents WHERE id = $1", [id]
  );
  const doc = rows[0];
  if (!doc) return { s, doc: null };
  const role = await docRole(doc, s);
  return { s, doc: atLeast(role, "manager") ? doc : null };
}

const ROLE_FR: Record<Role, string> = { viewer: "lecture seule", editor: "édition", manager: "gestion" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const { s, doc } = await managedDoc(id);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (!doc) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT u.matricule, u.codename, ds.role FROM document_shares ds JOIN users u ON u.id = ds.user_id WHERE ds.doc_id = $1`,
    [id]
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const { s, doc } = await managedDoc(id);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (!doc) return NextResponse.json({ error: "Rôle Gestionnaire requis pour partager ce document." }, { status: 403 });
  const { matricule, role } = await req.json();
  const r = normalizeRole(role);
  const pool = await db();
  const { rows } = await pool.query("SELECT id, codename FROM users WHERE matricule = $1 AND status = 'active'", [
    (matricule || "").trim().toUpperCase(),
  ]);
  if (!rows[0]) return NextResponse.json({ error: "Matricule inconnu ou agent inactif." }, { status: 404 });
  await pool.query(
    "INSERT INTO document_shares (doc_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (doc_id, user_id) DO UPDATE SET role = EXCLUDED.role",
    [id, rows[0].id, r]
  );
  audit(s, "doc_share", `#${id} ${doc.title} -> ${(matricule || "").trim().toUpperCase()} (${r})`);
  dmByUserId(
    rows[0].id,
    `🦅 **TRANSMISSION S.H.I.E.L.D.** — Agent **${s.codename}** vous a accordé l'accès (**${ROLE_FR[r]}**) au document classifié **« ${doc.title} »**. Ouvrir : ${process.env.PORTAL_URL}/doc/${id}`
  );
  return NextResponse.json({ ok: true, codename: rows[0].codename, role: r });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const { s, doc } = await managedDoc(id);
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (!doc) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const { matricule } = await req.json();
  const pool = await db();
  await pool.query(
    `DELETE FROM document_shares WHERE doc_id = $1 AND user_id = (SELECT id FROM users WHERE matricule = $2)`,
    [id, (matricule || "").trim().toUpperCase()]
  );
  audit(s, "doc_unshare", `#${id} -> ${(matricule || "").trim().toUpperCase()}`);
  return NextResponse.json({ ok: true });
}
