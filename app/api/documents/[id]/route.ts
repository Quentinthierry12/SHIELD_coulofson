import { NextResponse } from "next/server";
import { db, audit, accessibleFolderIds } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";
import { docRole, atLeast } from "@/lib/permissions";

// Modifier un document (renommer / déplacer / reclassifier) ou le desceller. Les droits
// dépendent du rôle effectif : Éditeur pour renommer, Gestionnaire pour déplacer /
// reclassifier / supprimer. Chaque champ est optionnel : absent = « ne pas toucher ».
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const { folder_id, classification, title, unlock } = await req.json();
  const pool = await db();

  const { rows: cur } = await pool.query(
    "SELECT id, locked, title, owner_id, folder_id, classification FROM documents WHERE id = $1", [id]
  );
  if (!cur[0]) return NextResponse.json({ error: "Document inconnu." }, { status: 404 });
  const role = await docRole(cur[0], s);
  if (!role) return NextResponse.json({ error: "Access denied." }, { status: 403 });

  // Breaking the seal voids every signature on the document — officers only, and the
  // signers are told, because their signature no longer stands.
  if (unlock) {
    if (s.role !== "admin") return NextResponse.json({ error: "Seul un officier peut desceller un document." }, { status: 403 });
    await pool.query("UPDATE documents SET locked = false WHERE id = $1", [id]);
    const { rows: voided } = await pool.query(
      `UPDATE signature_requests SET status = 'voided', completed_at = now()
        WHERE doc_id = $1 AND status IN ('pending', 'complete') RETURNING id`, [id]
    );
    for (const v of voided) {
      const { rows: sg } = await pool.query("SELECT user_id FROM signature_signers WHERE request_id = $1", [v.id]);
      for (const x of sg) {
        dmByUserId(x.user_id, `🦅 **S.H.I.E.L.D.** — **${cur[0].title}** was unsealed by an officer. Your signature is no longer valid.`);
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
    if (!atLeast(role, "editor")) return NextResponse.json({ error: "Editor role required to rename this document." }, { status: 403 });
    const name = String(title).trim();
    if (!name) return NextResponse.json({ error: "The title cannot be empty." }, { status: 400 });
    if (name.length > 200) return NextResponse.json({ error: "The title is too long (200 characters max)." }, { status: 400 });
    await pool.query("UPDATE documents SET title = $2 WHERE id = $1", [id, name]);
    audit(s, "doc_rename", `#${id} -> ${name}`);
  }

  if (classification !== undefined) {
    if (!atLeast(role, "manager")) return NextResponse.json({ error: "Manager role required to reclassify this document." }, { status: 403 });
    const level = Math.min(10, Math.max(1, parseInt(String(classification), 10) || 1));
    // You cannot classify above your own clearance — that would hide the document from
    // yourself, and let an agent lock a file away above the officers who vetted them.
    if (level > s.clearance) {
      return NextResponse.json(
        { error: `You can only classify up to your own clearance (level ${s.clearance}).` },
        { status: 403 }
      );
    }
    await pool.query("UPDATE documents SET classification = $2 WHERE id = $1", [id, level]);
    audit(s, "doc_classify", `#${id} ${cur[0].title} -> lvl ${level}`);
  }

  if (folder_id !== undefined) {
    if (!atLeast(role, "manager")) return NextResponse.json({ error: "Manager role required to move this document." }, { status: 403 });
    const target = folder_id ? parseInt(folder_id, 10) : null;
    // Destination must be a folder the agent can access (or the Drive root).
    if (target !== null) {
      const ids = await accessibleFolderIds(s.id, s.role);
      if (!ids.includes(target)) return NextResponse.json({ error: "You cannot move it there." }, { status: 403 });
    }
    await pool.query("UPDATE documents SET folder_id = $2 WHERE id = $1", [id, target]);
    audit(s, "doc_move", `#${id} -> folder ${target ?? "root"}`);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const pool = await db();
  const { rows: cur } = await pool.query("SELECT id, locked, owner_id, folder_id, classification, title FROM documents WHERE id = $1", [id]);
  if (!cur[0]) return NextResponse.json({ error: "Document inconnu." }, { status: 404 });
  if (cur[0].locked) {
    return NextResponse.json(
      { error: "This document is sealed by signature and cannot be destroyed. Unseal it first." },
      { status: 409 }
    );
  }
  const role = await docRole(cur[0], s);
  if (!atLeast(role, "manager")) return NextResponse.json({ error: "Manager role required to destroy this document." }, { status: 403 });
  await pool.query("DELETE FROM documents WHERE id = $1", [id]);
  await pool.query("DELETE FROM document_shares WHERE doc_id = $1", [id]);
  audit(s, "doc_destroy", `#${id} ${cur[0].title}`);
  return NextResponse.json({ ok: true });
}
