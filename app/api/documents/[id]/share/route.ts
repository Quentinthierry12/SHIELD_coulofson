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

const ROLE_FR: Record<Role, string> = { viewer: "view", editor: "edit", manager: "manage" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const { s, doc } = await managedDoc(id);
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!doc) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const pool = await db();
  const { rows: users } = await pool.query(
    `SELECT 'user' AS kind, u.matricule, u.codename, ds.role
       FROM document_shares ds JOIN users u ON u.id = ds.user_id WHERE ds.doc_id = $1`,
    [id]
  );
  const { rows: divs } = await pool.query(
    `SELECT 'division' AS kind, d.id AS division_id, d.name,
            (SELECT COUNT(*) FROM users u WHERE u.division_id = d.id AND u.status = 'active')::int AS members,
            dds.role
       FROM document_division_shares dds JOIN divisions d ON d.id = dds.division_id WHERE dds.doc_id = $1
      ORDER BY d.name`,
    [id]
  );
  // Divisions first — a group grant reads as the broader stroke.
  return NextResponse.json([...divs, ...users]);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const { s, doc } = await managedDoc(id);
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!doc) return NextResponse.json({ error: "Manager role required to share this document." }, { status: 403 });
  const body = await req.json();
  const r = normalizeRole(body.role);
  const pool = await db();

  // Grant to a whole division: every active member inherits the role dynamically.
  if (body.division_id) {
    const { rows: dv } = await pool.query("SELECT id, name FROM divisions WHERE id = $1", [body.division_id]);
    if (!dv[0]) return NextResponse.json({ error: "Unknown division." }, { status: 404 });
    await pool.query(
      "INSERT INTO document_division_shares (doc_id, division_id, role) VALUES ($1, $2, $3) ON CONFLICT (doc_id, division_id) DO UPDATE SET role = EXCLUDED.role",
      [id, dv[0].id, r]
    );
    audit(s, "doc_share", `#${id} ${doc.title} -> division ${dv[0].name} (${r})`);
    // Notify the active members (fire-and-forget).
    const { rows: mem } = await pool.query("SELECT id FROM users WHERE division_id = $1 AND status = 'active'", [dv[0].id]);
    for (const m of mem) {
      dmByUserId(
        m.id,
        `🦅 **S.H.I.E.L.D. TRANSMISSION** — Agent **${s.codename}** granted your division **${dv[0].name}** access (**${ROLE_FR[r]}**) to the classified document **“${doc.title}”**. Open: ${process.env.PORTAL_URL}/doc/${id}`
      );
    }
    return NextResponse.json({ ok: true, name: dv[0].name, role: r, kind: "division" });
  }

  // Grant to a single agent.
  const badge = (body.matricule || "").trim().toUpperCase();
  const { rows } = await pool.query("SELECT id, codename FROM users WHERE matricule = $1 AND status = 'active'", [badge]);
  if (!rows[0]) return NextResponse.json({ error: "Unknown badge or inactive agent." }, { status: 404 });
  await pool.query(
    "INSERT INTO document_shares (doc_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (doc_id, user_id) DO UPDATE SET role = EXCLUDED.role",
    [id, rows[0].id, r]
  );
  audit(s, "doc_share", `#${id} ${doc.title} -> ${badge} (${r})`);
  dmByUserId(
    rows[0].id,
    `🦅 **S.H.I.E.L.D. TRANSMISSION** — Agent **${s.codename}** granted you access (**${ROLE_FR[r]}**) to the classified document **“${doc.title}”**. Open: ${process.env.PORTAL_URL}/doc/${id}`
  );
  return NextResponse.json({ ok: true, codename: rows[0].codename, role: r, kind: "user" });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const { s, doc } = await managedDoc(id);
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!doc) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const body = await req.json();
  const pool = await db();
  if (body.division_id) {
    await pool.query("DELETE FROM document_division_shares WHERE doc_id = $1 AND division_id = $2", [id, body.division_id]);
    audit(s, "doc_unshare", `#${id} -> division ${body.division_id}`);
    return NextResponse.json({ ok: true });
  }
  const badge = (body.matricule || "").trim().toUpperCase();
  await pool.query(
    `DELETE FROM document_shares WHERE doc_id = $1 AND user_id = (SELECT id FROM users WHERE matricule = $2)`,
    [id, badge]
  );
  audit(s, "doc_unshare", `#${id} -> ${badge}`);
  return NextResponse.json({ ok: true });
}
