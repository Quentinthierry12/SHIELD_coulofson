import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { docHash, renderPendingSlots } from "@/lib/signatures";
import { dmByUserId } from "@/lib/discord";
import { signatureRequestPush } from "@/lib/push";

// The inbox. One endpoint serves both sides: an agent gets what they must sign, an
// officer additionally gets what they are waiting on. Same view, different scope —
// building two screens for the same data would just be two things to keep in step.
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const pool = await db();

  const base = `
    SELECT r.id, r.doc_id, r.circuit, r.sequential, r.note, r.status, r.created_at,
           r.completed_at, r.doc_version, r.content_hash,
           d.title, d.classification, d.locked,
           ru.codename AS requested_by_codename, ru.matricule AS requested_by_matricule,
           COALESCE(
             (SELECT json_agg(json_build_object(
                       'user_id', sg.user_id, 'position', sg.position, 'status', sg.status,
                       'kind', sg.kind, 'signed_at', sg.signed_at, 'reason', sg.reason,
                       'matricule', su.matricule, 'codename', su.codename)
                     ORDER BY sg.position)
                FROM signature_signers sg JOIN users su ON su.id = sg.user_id
               WHERE sg.request_id = r.id), '[]'
           ) AS signers
      FROM signature_requests r
      JOIN documents d ON d.id = r.doc_id
      LEFT JOIN users ru ON ru.id = r.requested_by`;

  // What I have to sign.
  const { rows: mine } = await pool.query(
    `${base} WHERE r.status = 'pending'
        AND EXISTS (SELECT 1 FROM signature_signers x WHERE x.request_id = r.id AND x.user_id = $1 AND x.status = 'pending')
      ORDER BY r.created_at`,
    [s.id]
  );

  // What I am waiting on: requests I issued, plus (for officers) everything still open.
  const { rows: waiting } = await pool.query(
    `${base} WHERE r.status = 'pending' AND (r.requested_by = $1 OR $2 = 'admin')
      ORDER BY r.created_at DESC`,
    [s.id, s.role]
  );

  // Recently settled, for context.
  const { rows: done } = await pool.query(
    `${base} WHERE r.status <> 'pending'
        AND (r.requested_by = $1 OR $2 = 'admin'
             OR EXISTS (SELECT 1 FROM signature_signers x WHERE x.request_id = r.id AND x.user_id = $1))
      ORDER BY r.completed_at DESC NULLS LAST LIMIT 20`,
    [s.id, s.role]
  );

  return NextResponse.json({ to_sign: mine, waiting, done });
}

// Create a signature request. The document owner or an officer may ask.
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { doc_id, signers, sequential, note, circuit } = await req.json();
  const docId = parseInt(String(doc_id), 10);
  const pool = await db();

  const { rows: d } = await pool.query("SELECT title, owner_id, locked FROM documents WHERE id = $1", [docId]);
  if (!d[0]) return NextResponse.json({ error: "Document inconnu." }, { status: 404 });
  if (s.role !== "admin" && d[0].owner_id !== s.id) {
    return NextResponse.json({ error: "Only the document owner or an officer can request signatures." }, { status: 403 });
  }
  if (d[0].locked) return NextResponse.json({ error: "This document is already sealed." }, { status: 409 });
  const { rowCount: openReq } = await pool.query(
    "SELECT 1 FROM signature_requests WHERE doc_id = $1 AND status = 'pending'", [docId]
  );
  if (openReq) return NextResponse.json({ error: "A signature request is already open on this document." }, { status: 409 });

  const badges = (Array.isArray(signers) ? signers : String(signers || "").split(/[\s,;]+/))
    .map((b: string) => String(b).trim().toUpperCase()).filter(Boolean);
  if (!badges.length) return NextResponse.json({ error: "Au moins un signataire est requis." }, { status: 400 });

  const resolved: { id: number; matricule: string; codename: string }[] = [];
  for (const b of [...new Set(badges)]) {
    const { rows } = await pool.query(
      "SELECT id, matricule, codename FROM users WHERE matricule = $1 AND status = 'active'", [b]
    );
    if (!rows[0]) return NextResponse.json({ error: `Agent ${b} introuvable ou inactif.` }, { status: 404 });
    resolved.push(rows[0]);
  }

  const fp = await docHash(docId);
  if (!fp) return NextResponse.json({ error: "Document inconnu." }, { status: 404 });

  const { rows: r } = await pool.query(
    `INSERT INTO signature_requests (doc_id, requested_by, circuit, sequential, note, doc_version, content_hash, original_content)
     VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT content FROM documents WHERE id = $1)) RETURNING id`,
    [docId, s.id, circuit || "free", !!sequential, (note || "").trim() || null, fp.version, fp.hash]
  );
  const reqId = r[0].id;

  for (let i = 0; i < resolved.length; i++) {
    await pool.query(
      "INSERT INTO signature_signers (request_id, user_id, position) VALUES ($1, $2, $3)",
      [reqId, resolved[i].id, i]
    );
    // Signers must be able to open what they are asked to sign.
    await pool.query("INSERT INTO document_shares (doc_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [docId, resolved[i].id]);
  }

  // Requesting signatures seals the document: a signature on editable content is worthless.
  await pool.query("UPDATE documents SET locked = true WHERE id = $1", [docId]);
  // Show the slots as "awaiting signature" right away, so the first signer never sees a raw marker.
  await renderPendingSlots(docId, reqId);

  // In a sequential circuit only the first signer is called up; the rest are told in turn.
  const toNotify = sequential ? resolved.slice(0, 1) : resolved;
  for (const a of toNotify) {
    dmByUserId(a.id, `🦅 **S.H.I.E.L.D. SIGNATURE REQUEST** — Your signature is required on **${d[0].title}**. ${process.env.PORTAL_URL}/inbox`, signatureRequestPush(d[0].title, docId));
  }
  audit(s, "signature_request", `#${docId} ${d[0].title} -> ${resolved.map((a) => a.matricule).join(",")}`);
  return NextResponse.json({ id: reqId });
}
