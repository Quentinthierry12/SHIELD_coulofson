import { createHash } from "crypto";
import { db } from "./db";

// A signature is only meaningful if it binds to an exact state of the document.
// OnlyOffice overwrites content on every save and keeps no history, so we fingerprint
// the bytes at request time and re-check them at signing time.
export const hashContent = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");

export async function docHash(docId: number): Promise<{ hash: string; version: number } | null> {
  const p = await db();
  const { rows } = await p.query("SELECT content, version FROM documents WHERE id = $1", [docId]);
  if (!rows[0]) return null;
  return { hash: hashContent(rows[0].content), version: rows[0].version };
}

// Whose turn is it? In a sequential circuit only the lowest unsigned position may sign;
// in a parallel one every pending signer may sign at any time.
export function isMyTurn(
  signers: { user_id: number; position: number; status: string }[],
  userId: number,
  sequential: boolean
): boolean {
  const me = signers.find((s) => s.user_id === userId);
  if (!me || me.status !== "pending") return false;
  if (!sequential) return true;
  const firstPending = signers
    .filter((s) => s.status === "pending")
    .sort((a, b) => a.position - b.position)[0];
  return firstPending?.user_id === userId;
}

// Raise a signature request on a document, server-side (no HTTP round trip). Used by the
// administrative circuit: an auto-generated agent file asks for its own signatures.
// Returns null when there is nothing to ask (no signers, or a request is already open).
export async function requestSignature(opts: {
  docId: number;
  signerIds: number[];
  requestedBy: number | null;
  circuit?: string;
  sequential?: boolean;
  note?: string;
}): Promise<number | null> {
  const { docId, signerIds, requestedBy, circuit = "free", sequential = false, note } = opts;
  const ids = [...new Set(signerIds)].filter(Boolean);
  if (!ids.length) return null;
  const p = await db();
  const { rowCount: open } = await p.query(
    "SELECT 1 FROM signature_requests WHERE doc_id = $1 AND status = 'pending'", [docId]
  );
  if (open) return null;
  const fp = await docHash(docId);
  if (!fp) return null;

  const { rows } = await p.query(
    `INSERT INTO signature_requests (doc_id, requested_by, circuit, sequential, note, doc_version, content_hash, original_content)
     VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT content FROM documents WHERE id = $1)) RETURNING id`,
    [docId, requestedBy, circuit, sequential, note || null, fp.version, fp.hash]
  );
  const reqId = rows[0].id;
  for (let i = 0; i < ids.length; i++) {
    await p.query("INSERT INTO signature_signers (request_id, user_id, position) VALUES ($1, $2, $3)", [reqId, ids[i], i]);
    await p.query("INSERT INTO document_shares (doc_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [docId, ids[i]]);
  }
  // Asking for signatures seals the document — same rule as a manual request.
  await p.query("UPDATE documents SET locked = true WHERE id = $1", [docId]);
  await renderPendingSlots(docId, reqId);
  return reqId;
}

// Cancel whatever is pending on a document and release it — used when an auto-generated
// file is regenerated: the signers would otherwise be signing a version that no longer exists.
export async function voidPendingRequests(docId: number): Promise<number> {
  const p = await db();
  const { rowCount } = await p.query(
    "UPDATE signature_requests SET status = 'cancelled', completed_at = now() WHERE doc_id = $1 AND status = 'pending'",
    [docId]
  );
  if (rowCount) await p.query("UPDATE documents SET locked = false WHERE id = $1", [docId]);
  return rowCount || 0;
}

// The administrative circuit: an auto-generated agent file carries [[SIGN:<badge>]] and
// [[SIGN:officer]] slots, so it asks the agent to acknowledge it and an officer to
// countersign. Sequential — the agent reads and signs first, the officer validates after.
export async function requestPersonnelSignature(
  docId: number,
  agentId: number,
  officerId: number | null
): Promise<number | null> {
  // Regenerating replaces the content, so anything pending was raised on a version that
  // no longer exists — void it before asking again.
  await voidPendingRequests(docId);
  const signers = officerId && officerId !== agentId ? [agentId, officerId] : [agentId];
  return requestSignature({
    docId, signerIds: signers, requestedBy: officerId, circuit: "admin", sequential: true,
    note: "Personnel file — read and sign your oath of service.",
  });
}

// Render the slots of a freshly-raised request: no signature yet, so every [[SIGN:…]]
// becomes "awaiting signature" and [[DATE]] a blank rule. Without this the FIRST signer
// opens the document and is met with raw [[SIGN:AG-4782]] markers — the very thing the
// slots were meant to replace.
export async function renderPendingSlots(docId: number, requestId: number): Promise<void> {
  try {
    const { fillSignMarkers } = await import("./sigmarkers");
    const p = await db();
    const { rows } = await p.query(
      "SELECT d.filetype, r.original_content FROM documents d, signature_requests r WHERE d.id = $1 AND r.id = $2",
      [docId, requestId]
    );
    if (rows[0]?.filetype !== "docx" || !rows[0].original_content) return;
    const out = await fillSignMarkers(rows[0].original_content, new Map(), [], null);
    // `replaced` counts filled signatures — zero here by construction, so compare bytes.
    if (out.buffer.equals(rows[0].original_content)) return; // no slots in this document
    const { rows: up } = await p.query(
      "UPDATE documents SET content = $2, version = version + 1, updated_at = now() WHERE id = $1 RETURNING content",
      [docId, out.buffer]
    );
    await p.query("UPDATE signature_requests SET content_hash = $2 WHERE id = $1", [requestId, hashContent(up[0].content)]);
  } catch (e) {
    console.error("[signature] could not render pending slots:", e);
  }
}
