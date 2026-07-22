import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { docHash, isMyTurn, hashContent } from "@/lib/signatures";
import { appendSignatureBlock, type SignatureLine } from "@/lib/docxgen";
import { fillSignMarkers } from "@/lib/sigmarkers";
import { dmByUserId } from "@/lib/discord";
import { signatureRequestPush } from "@/lib/push";

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
  if (!request) return NextResponse.json({ error: "Demande de signature inconnue." }, { status: 404 });
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
      { error: "The document changed since the request. It was cancelled — request a new one." },
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

  // Engrave after EVERY signature, not only the last: whoever has signed must see their
  // signature on the page, and the next signer countersigns something visible. Slots not
  // yet filled read "awaiting signature".
  //
  // Always redone from the ORIGINAL copy kept with the request, never patched onto the
  // previous render: patching consumed the [[DATE]] marker on the first signature, so the
  // sealing date could never be stamped. Rebuilding is also idempotent.
  //
  // This rewrites the document, which is exactly what content_hash guards against — so the
  // fingerprint is updated here. The guarantee is unchanged: a change that does NOT come
  // from this circuit still fails the next signer's check.
  const sealing = remaining.length === 0;
  const { rows: docRow } = await pool.query(
    "SELECT d.filetype, r.original_content FROM documents d, signature_requests r WHERE d.id = $1 AND r.id = $2",
    [request.doc_id, id]
  );
  if (docRow[0]?.filetype === "docx" && docRow[0].original_content) {
    try {
      const signedSoFar = after.filter((x: any) => x.status === "signed");
      const fill = (x: any) => ({
        codename: x.codename, matricule: x.matricule, at: new Date(x.signed_at),
        role: x.role === "admin" ? "Officer" : undefined,
      });
      const byBadge = new Map<string, any>(signedSoFar.map((x: any) => [String(x.matricule).toUpperCase(), fill(x)]));
      // Role slots take the first signer holding that role.
      const off = signedSoFar.find((x: any) => x.role === "admin");
      if (off) byBadge.set("OFFICER", fill(off));
      const ag = signedSoFar.find((x: any) => x.role !== "admin");
      if (ag) byBadge.set("AGENT", { ...fill(ag), role: undefined });

      const marked = await fillSignMarkers(
        docRow[0].original_content, byBadge, signedSoFar.map(fill), sealing ? new Date() : null
      );
      // No [[SIGN]] slot in the document: fall back to a block appended at the end, and
      // only once everything is signed — appending on each signature would stack blocks.
      const content = marked.replaced > 0
        ? marked.buffer
        : sealing
          ? await appendSignatureBlock(
              docRow[0].original_content,
              after.map((x: any) => ({ ...fill(x), kind: x.kind })) as SignatureLine[],
              request.content_hash
            )
          : null;

      if (content) {
        const { rows: up } = await pool.query(
          "UPDATE documents SET content = $2, version = version + 1, updated_at = now() WHERE id = $1 RETURNING content",
          [request.doc_id, content]
        );
        await pool.query("UPDATE signature_requests SET content_hash = $2 WHERE id = $1", [id, hashContent(up[0].content)]);
        audit(s, "signature_engrave",
          `${request.title} — ${marked.replaced > 0 ? `${marked.replaced} slot(s) in place` : "block appended"}${sealing ? ", sealed" : ""}`);
      }
    } catch (e) {
      // The signature stands even if the page could not be rendered — log it rather than
      // reject the signature the agent just gave.
      console.error("[signature] engrave failed:", e);
    }
  }

  if (sealing) {
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
      dmByUserId(nu[0].user_id, `🦅 **S.H.I.E.L.D. SIGNATURE REQUEST** — It's your turn to sign **${request.title}**. ${process.env.PORTAL_URL}/inbox`, signatureRequestPush(request.title, request.doc_id, "Your turn to sign"));
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
  if (!request) return NextResponse.json({ error: "Demande de signature inconnue." }, { status: 404 });
  if (s.role !== "admin" && request.requested_by !== s.id) {
    return NextResponse.json({ error: "Seul le demandeur ou un officier peut annuler." }, { status: 403 });
  }
  if (request.status === "complete") {
    return NextResponse.json({ error: "A sealed document cannot be un-signed. Unlock it instead — that voids the signatures." }, { status: 409 });
  }
  await pool.query("UPDATE signature_requests SET status = 'cancelled', completed_at = now() WHERE id = $1", [id]);
  await pool.query("UPDATE documents SET locked = false WHERE id = $1", [request.doc_id]);
  audit(s, "signature_cancel", `${request.title}`);
  return NextResponse.json({ ok: true });
}
