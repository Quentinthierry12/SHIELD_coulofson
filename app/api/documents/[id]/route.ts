import { NextResponse } from "next/server";
import { db, audit, accessibleFolderIds } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";

// Move a document to another folder (drag & drop) and/or change its classification.
// Owner or officer only. Both fields are optional: absent means "leave alone".
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const { folder_id, classification, title, unlock } = await req.json();
  const pool = await db();

  const { rows: cur } = await pool.query("SELECT locked, title, owner_id FROM documents WHERE id = $1", [id]);
  if (!cur[0]) return NextResponse.json({ error: "Unknown document." }, { status: 404 });

  // Breaking the seal voids every signature on the document — officers only, and the
  // signers are told, because their signature no longer stands.
  if (unlock) {
    if (s.role !== "admin") return NextResponse.json({ error: "Only an officer can unseal a document." }, { status: 403 });
    await pool.query("UPDATE documents SET locked = false WHERE id = $1", [id]);
    const { rows: voided } = await pool.query(
      `UPDATE signature_requests SET status = 'voided', completed_at = now()
        WHERE doc_id = $1 AND status IN ('pending', 'complete') RETURNING id`, [id]
    );
    for (const v of voided) {
      const { rows: sg } = await pool.query("SELECT user_id FROM signature_signers WHERE request_id = $1", [v.id]);
      for (const x of sg) {
        dmByUserId(x.user_id, `🦅 **S.H.I.E.L.D.** — **${cur[0].title}** has been unsealed by an officer. Your signature on it no longer stands.`);
      }
    }
    audit(s, "doc_unseal", `#${id} ${cur[0].title} — ${voided.length} request(s) voided`);
    return NextResponse.json({ ok: true, voided: voided.length });
  }

  // A sealed document is immutable: signatures are bound to these exact bytes, and the
  // title is part of what was signed. The UI hides these actions, but the API is the
  // real gate — a guard only in the interface is decoration.
  if (cur[0].locked) {
    return NextResponse.json(
      { error: "This document is sealed by signature. An officer must unseal it first — that voids the signatures." },
      { status: 409 }
    );
  }

  if (title !== undefined) {
    const name = String(title).trim();
    if (!name) return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
    if (name.length > 200) return NextResponse.json({ error: "Title is too long (200 characters max)." }, { status: 400 });
    const { rows } = await pool.query(
      "UPDATE documents SET title = $2 WHERE id = $1 AND (owner_id = $3 OR $4 = 'admin') RETURNING title",
      [id, name, s.id, s.role]
    );
    if (!rows[0]) return NextResponse.json({ error: "Only the document owner or an officer can rename it." }, { status: 403 });
    audit(s, "doc_rename", `#${id} -> ${name}`);
  }

  if (classification !== undefined) {
    const level = Math.min(10, Math.max(1, parseInt(String(classification), 10) || 1));
    // You cannot classify above your own clearance — that would hide the document from
    // yourself, and let an agent lock a file away above the officers who vetted them.
    if (level > s.clearance) {
      return NextResponse.json(
        { error: `You can only classify up to your own clearance (level ${s.clearance}).` },
        { status: 403 }
      );
    }
    const { rows } = await pool.query(
      "UPDATE documents SET classification = $2 WHERE id = $1 AND (owner_id = $3 OR $4 = 'admin') RETURNING title, classification",
      [id, level, s.id, s.role]
    );
    if (!rows[0]) {
      return NextResponse.json({ error: "Only the document owner or an officer can reclassify it." }, { status: 403 });
    }
    audit(s, "doc_classify", `#${id} ${rows[0].title} -> lvl ${level}`);
  }

  if (folder_id !== undefined) {
    const target = folder_id ? parseInt(folder_id, 10) : null;
    // Destination must be a folder the agent can access (or the Drive root).
    if (target !== null) {
      const ids = await accessibleFolderIds(s.id, s.role);
      if (!ids.includes(target)) return NextResponse.json({ error: "You cannot move it there." }, { status: 403 });
    }
    const { rows } = await pool.query(
      "UPDATE documents SET folder_id = $2 WHERE id = $1 AND (owner_id = $3 OR $4 = 'admin') RETURNING title",
      [id, target, s.id, s.role]
    );
    if (!rows[0]) return NextResponse.json({ error: "Only the document owner or an officer can move it." }, { status: 403 });
    audit(s, "doc_move", `#${id} -> folder ${target ?? "root"}`);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const pool = await db();
  const { rows: sealed } = await pool.query("SELECT locked FROM documents WHERE id = $1", [id]);
  if (sealed[0]?.locked) {
    return NextResponse.json(
      { error: "This document is sealed by signature and cannot be destroyed. Unseal it first." },
      { status: 409 }
    );
  }
  const { rows } = await pool.query(
    "DELETE FROM documents WHERE id = $1 AND (owner_id = $2 OR $3 = 'admin') RETURNING title",
    [id, s.id, s.role]
  );
  if (!rows[0]) return NextResponse.json({ error: "Only the document owner or an officer can destroy it." }, { status: 403 });
  await pool.query("DELETE FROM document_shares WHERE doc_id = $1", [id]);
  audit(s, "doc_destroy", `#${id} ${rows[0].title}`);
  return NextResponse.json({ ok: true });
}
