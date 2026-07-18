import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// Officer view: every document with where it stands on signatures. The agent-facing
// /inbox only shows requests; this answers the question an officer actually asks —
// "what is out there, and who has not signed yet?"
export async function GET() {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Officers only." }, { status: 403 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT d.id, d.title, d.filetype, d.classification, d.locked AS sealed, d.is_personnel,
            d.updated_at, u.codename AS owner, u.matricule AS owner_badge,
            r.id AS request_id, r.status AS request_status, r.sequential, r.created_at AS requested_at,
            r.completed_at, ru.codename AS requested_by,
            COALESCE(
              (SELECT json_agg(json_build_object(
                        'matricule', su.matricule, 'codename', su.codename,
                        'status', sg.status, 'signed_at', sg.signed_at,
                        'reason', sg.reason, 'position', sg.position)
                      ORDER BY sg.position)
                 FROM signature_signers sg JOIN users su ON su.id = sg.user_id
                WHERE sg.request_id = r.id), '[]'
            ) AS signers
       FROM documents d
       LEFT JOIN users u ON u.id = d.owner_id
       -- the most recent request per document; older ones are history
       LEFT JOIN LATERAL (
         SELECT * FROM signature_requests sr
          WHERE sr.doc_id = d.id ORDER BY sr.created_at DESC LIMIT 1
       ) r ON true
       LEFT JOIN users ru ON ru.id = r.requested_by
      ORDER BY
        -- what needs an officer's attention first: pending, then unsigned, then settled
        CASE WHEN r.status = 'pending' THEN 0 WHEN r.id IS NULL THEN 1 ELSE 2 END,
        d.updated_at DESC`
  );
  return NextResponse.json(rows);
}
