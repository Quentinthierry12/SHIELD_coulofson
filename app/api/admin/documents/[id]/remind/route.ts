import { NextResponse } from "next/server";
import { dmPrefix } from "@/lib/brand";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";
import { signatureRequestPush } from "@/lib/push";

// Chase whoever is holding up a signature. In a sequential circuit only the agent whose
// turn it is gets pinged — reminding someone who cannot sign yet is just noise.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Officers only." }, { status: 403 });
  const id = parseInt((await params).id, 10);
  const pool = await db();

  const { rows } = await pool.query(
    `SELECT r.id, r.sequential, d.title
       FROM signature_requests r JOIN documents d ON d.id = r.doc_id
      WHERE r.doc_id = $1 AND r.status = 'pending'
      ORDER BY r.created_at DESC LIMIT 1`,
    [id]
  );
  if (!rows[0]) return NextResponse.json({ error: "Aucune demande de signature n'est ouverte sur ce document." }, { status: 404 });
  const request = rows[0];

  const { rows: pending } = await pool.query(
    `SELECT sg.user_id, sg.position FROM signature_signers sg
      WHERE sg.request_id = $1 AND sg.status = 'pending' ORDER BY sg.position`,
    [request.id]
  );
  if (!pending.length) return NextResponse.json({ error: "Everyone has already responded." }, { status: 409 });

  const targets = request.sequential ? pending.slice(0, 1) : pending;
  for (const t of targets) {
    dmByUserId(
      t.user_id,
      `${dmPrefix("REMINDER")} — Your signature is still required on **${request.title}**. ${process.env.PORTAL_URL}/inbox`,
      signatureRequestPush(request.title, id, "Signature reminder")
    );
  }
  audit(s, "signature_remind", `${request.title} — ${targets.length} agent(s)`);
  return NextResponse.json({ ok: true, sent: targets.length });
}
