import { NextResponse } from "next/server";
import { db, audit, getAccessibleDoc } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";

// An agent asks for access to a document they can see but cannot open
// (blocked by clearance or by a private folder).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const { reason } = await req.json().catch(() => ({ reason: "" }));

  const pool = await db();
  const { rows: d } = await pool.query("SELECT id, title, owner_id, classification FROM documents WHERE id = $1", [id]);
  const doc = d[0];
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  // Already allowed? Nothing to request.
  if (await getAccessibleDoc(id, s.clearance, s.id, s.role)) {
    return NextResponse.json({ error: "You already have access." }, { status: 400 });
  }

  await pool.query(
    `INSERT INTO access_requests (doc_id, user_id, reason, status) VALUES ($1, $2, $3, 'pending')
     ON CONFLICT (doc_id, user_id) DO UPDATE SET status = 'pending', reason = EXCLUDED.reason, created_at = now(), decided_by = NULL, decided_at = NULL`,
    [id, s.id, (reason || "").slice(0, 300)]
  );
  audit(s, "access_request", `#${id} ${doc.title}`);

  // Notify the owner, plus every officer who could grant it.
  const { rows: officers } = await pool.query("SELECT id FROM users WHERE role = 'admin' AND status = 'active'");
  const targets = new Set<number>([...officers.map((o: any) => o.id)]);
  if (doc.owner_id) targets.add(doc.owner_id);
  targets.delete(s.id);
  for (const uid of targets) {
    dmByUserId(
      uid,
      `🦅 **S.H.I.E.L.D. ACCESS REQUEST** — Agent **${s.matricule} · ${s.codename}** requests access to **« ${doc.title} »** (LVL.${doc.classification}).${reason ? ` Reason: ${reason}` : ""} Review: ${process.env.PORTAL_URL}/admin`
    );
  }
  return NextResponse.json({ ok: true });
}
