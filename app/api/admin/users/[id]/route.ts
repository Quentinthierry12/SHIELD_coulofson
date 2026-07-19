import { NextResponse } from "next/server";
import { db, audit, refreshPersonnelFile } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";
import { personnelFilePush } from "@/lib/push";
import { deleteMoodleUser } from "@/lib/moodle";
import { requestPersonnelSignature } from "@/lib/signatures";

// Exiger (à nouveau) la signature du dossier : régénère la fiche, relance le circuit de
// serment et notifie l'agent. Tant qu'il ne l'a pas signé, son accès au système est bloqué
// (voir lib/onboarding). Sert aussi à re-forcer une signature après un changement de données.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const id = parseInt((await params).id, 10);
  const f = await refreshPersonnelFile(id);
  const rq = f ? await requestPersonnelSignature(f.docId, id, s.id) : null;
  if (rq) {
    dmByUserId(
      id,
      `🦅 **S.H.I.E.L.D. — DOSSIER D'AGENT** — Signe ton serment de service pour accéder au système. ${process.env.PORTAL_URL}/onboarding`,
      personnelFilePush()
    );
  }
  audit(s, "personnel_file", `user #${id}${f?.created ? " (new file — previous one is sealed)" : ""}`);
  return NextResponse.json({ ok: true, created: f?.created ?? false, requested: !!rq });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const id = parseInt((await params).id, 10);
  if (id === s.id) return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  const pool = await db();
  const { rows } = await pool.query("SELECT matricule, codename, clearance FROM users WHERE id = $1", [id]);
  const target = rows[0];
  if (!target) return NextResponse.json({ error: "Unknown agent." }, { status: 404 });
  if (target.clearance >= s.clearance) {
    return NextResponse.json({ error: "You cannot delete an agent at or above your own clearance." }, { status: 403 });
  }
  await deleteMoodleUser(id); // remove their Academy account too
  // Keep the agent's documents (orphaned), drop their access rows, then remove the account.
  await pool.query("UPDATE documents SET owner_id = NULL WHERE owner_id = $1", [id]);
  await pool.query("UPDATE folders SET created_by = NULL WHERE created_by = $1", [id]);
  await pool.query("DELETE FROM document_shares WHERE user_id = $1", [id]);
  await pool.query("DELETE FROM folder_members WHERE user_id = $1", [id]);
  await pool.query("DELETE FROM users WHERE id = $1", [id]);
  audit(s, "account_delete", `${target.matricule} (${target.codename})`);
  return NextResponse.json({ ok: true });
}
