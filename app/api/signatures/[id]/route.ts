import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { docHash, isMyTurn } from "@/lib/signatures";
import { appendSignatureBlock, type SignatureLine } from "@/lib/docxgen";
import { fillSignMarkers } from "@/lib/sigmarkers";
import { dmByUserId } from "@/lib/discord";

// Sign or decline. `kind` is "typed" (codename rendered in a script face) or "image"
// (the agent's uploaded handwritten signature).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const { kind, decline, reason } = await req.json();
  const pool = await db();

  const { rows: rr } = await pool.query(
    `SELECT r.*, d.title, d.filetype FROM signature_requests r JOIN documents d ON d.id = r.doc_id WHERE r.id = $1`,
    [id]
  );
  const request = rr[0];
  if (!request) return NextResponse.json({ error: "Unknown signature request." }, { status: 404 });
  if (request.status !== "pending") return NextResponse.json({ error: "This request is already settled." }, { status: 409 });

  const { rows: signers } = await pool.query(
    "SELECT user_id, position, status FROM signature_signers WHERE request_id = $1 ORDER BY position", [id]
  );
  if (!isMyTurn(signers, s.id, request.sequential)) {
    const mine = signers.find((x: any) => x.user_id === s.id);
    return NextResponse.json(
      { error: !mine ? "You are not a signer on this document." : mine.status !== "pending" ? "You have already responded." : "It is not your turn yet." },
      { status: 403 }
    );
  }

  if (decline) {
    await pool.query(
      "UPDATE signature_signers SET status = 'declined', reason = $2, signed_at = now() WHERE request_id = $1 AND user_id = $3",
      [id, (reason || "").trim() || null, s.id]
    );
    await pool.query("UPDATE signature_requests SET status = 'declined', completed_at = now() WHERE id = $1", [id]);
    // A refusal ends the circuit and releases the document so it can be corrected.
    await pool.query("UPDATE documents SET locked = false WHERE id = $1", [request.doc_id]);
    if (request.requested_by) {
      dmByUserId(request.requested_by, `🦅 **S.H.I.E.L.D.** — ${s.codename} (${s.matricule}) **declined** to sign **${request.title}**.${reason ? ` Reason: ${reason}` : ""}`);
    }
    audit(s, "signature_decline", `${request.title}${reason ? " — " + reason : ""}`);
    return NextResponse.json({ ok: true, declined: true });
  }

  // The document must still be byte-for-byte what was put up for signature.
  const fp = await docHash(request.doc_id);
  if (!fp || fp.hash !== request.content_hash) {
    await pool.query("UPDATE signature_requests SET status = 'broken', completed_at = now() WHERE id = $1", [id]);
    await pool.query("UPDATE documents SET locked = false WHERE id = $1", [request.doc_id]);
    audit(s, "signature_broken", `${request.title} — content changed since the request`);
    return NextResponse.json(
      { error: "The document changed since this request was raised. The request has been voided — ask for a new one." },
      { status: 409 }
    );
  }

  await pool.query(
    "UPDATE signature_signers SET status = 'signed', kind = $2, signed_at = now() WHERE request_id = $1 AND user_id = $3",
    [id, kind === "image" ? "image" : "typed", s.id]
  );
  audit(s, "signature_sign", `${request.title}`);

  const { rows: after } = await pool.query(
    `SELECT sg.status, sg.kind, sg.signed_at, sg.position, u.codename, u.matricule, u.role
       FROM signature_signers sg JOIN users u ON u.id = sg.user_id
      WHERE sg.request_id = $1 ORDER BY sg.position`, [id]
  );
  const remaining = after.filter((x: any) => x.status === "pending");

  if (remaining.length === 0) {
    // Everyone signed: engrave the block into the document and seal it for good.
    const { rows: doc } = await pool.query("SELECT content, filetype FROM documents WHERE id = $1", [request.doc_id]);
    if (doc[0] && doc[0].filetype === "docx") {
      try {
        const lines: SignatureLine[] = after.map((x: any) => ({
          codename: x.codename, matricule: x.matricule, at: new Date(x.signed_at),
          kind: x.kind, role: x.role === "admin" ? "Officer" : undefined,
        }));
        // If the author placed [[SIGN:…]] slots, sign in place — a real document reads
        // "Agent signature: ____ Date: ____", and a block bolted on at the end would
        // leave those lines blank. Only fall back to appending when there are no slots.
        const byBadge = new Map(
          after.map((x: any) => [
            String(x.matricule).toUpperCase(),
            { codename: x.codename, matricule: x.matricule, at: new Date(x.signed_at), role: x.role === "admin" ? "Officer" : undefined },
          ])
        );
        // A role slot ([[SIGN:officer]]) takes the first signer holding that role.
        const officer = after.find((x: any) => x.role === "admin");
        if (officer) {
          byBadge.set("OFFICER", { codename: officer.codename, matricule: officer.matricule, at: new Date(officer.signed_at), role: "Officer" });
        }
        const agent = after.find((x: any) => x.role !== "admin");
        if (agent) {
          byBadge.set("AGENT", { codename: agent.codename, matricule: agent.matricule, at: new Date(agent.signed_at), role: undefined });
        }
        const inPlace = await fillSignMarkers(
          doc[0].content, byBadge,
          after.map((x: any) => ({ codename: x.codename, matricule: x.matricule, at: new Date(x.signed_at), role: x.role === "admin" ? "Officer" : undefined })),
          new Date()
        );
        const sealed = inPlace.replaced > 0
          ? inPlace.buffer
          : await appendSignatureBlock(doc[0].content, lines, request.content_hash);
        await pool.query(
          "UPDATE documents SET content = $2, version = version + 1, updated_at = now() WHERE id = $1",
          [request.doc_id, sealed]
        );
        audit(s, "signature_engrave", inPlace.replaced > 0 ? `${request.title} — ${inPlace.replaced} slot(s) filled in place` : `${request.title} — block appended`);
      } catch (e) {
        // The signatures stand even if the block could not be engraved — say so in the log
        // rather than failing the signature the agent just gave.
        console.error("[signature] could not engrave the block:", e);
      }
    }
    await pool.query("UPDATE signature_requests SET status = 'complete', completed_at = now() WHERE id = $1", [id]);
    await pool.query("UPDATE documents SET locked = true WHERE id = $1", [request.doc_id]);
    const { rows: all } = await pool.query("SELECT user_id FROM signature_signers WHERE request_id = $1", [id]);
    const notify = new Set<number>([...all.map((x: any) => x.user_id), request.requested_by].filter(Boolean));
    for (const uid of notify) {
      dmByUserId(uid, `🦅 **S.H.I.E.L.D.** — **${request.title}** is fully signed and sealed. ${process.env.PORTAL_URL}/doc/${request.doc_id}`);
    }
    audit(s, "signature_complete", `${request.title}`);
  } else if (request.sequential) {
    // Call up the next signer in the chain.
    const next = remaining.sort((a: any, b: any) => a.position - b.position)[0];
    const { rows: nu } = await pool.query(
      "SELECT user_id FROM signature_signers WHERE request_id = $1 AND position = $2", [id, next.position]
    );
    if (nu[0]) {
      dmByUserId(nu[0].user_id, `🦅 **S.H.I.E.L.D. SIGNATURE REQUEST** — It is your turn to sign **${request.title}**. ${process.env.PORTAL_URL}/inbox`);
    }
  }

  return NextResponse.json({ ok: true, remaining: remaining.length });
}

// Cancel an open request (requester or officer) — releases the document.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT r.*, d.title FROM signature_requests r JOIN documents d ON d.id = r.doc_id WHERE r.id = $1`, [id]
  );
  const request = rows[0];
  if (!request) return NextResponse.json({ error: "Unknown signature request." }, { status: 404 });
  if (s.role !== "admin" && request.requested_by !== s.id) {
    return NextResponse.json({ error: "Only the requester or an officer can cancel." }, { status: 403 });
  }
  if (request.status === "complete") {
    return NextResponse.json({ error: "A sealed document cannot be unsigned. Unlock it instead — that voids the signatures." }, { status: 409 });
  }
  await pool.query("UPDATE signature_requests SET status = 'cancelled', completed_at = now() WHERE id = $1", [id]);
  await pool.query("UPDATE documents SET locked = false WHERE id = $1", [request.doc_id]);
  audit(s, "signature_cancel", `${request.title}`);
  return NextResponse.json({ ok: true });
}
