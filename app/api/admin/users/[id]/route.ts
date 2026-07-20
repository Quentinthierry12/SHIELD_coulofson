import { NextResponse } from "next/server";
import { db, audit, refreshPersonnelFile } from "@/lib/db";
import { getSession } from "@/lib/session";
import { deleteMoodleUser } from "@/lib/moodle";
import { requirePersonnelOath, voidPendingPersonnelRequests } from "@/lib/onboarding";

type Ev = { at: string; kind: string; label: string };

// Statut + mini-historique d'un compte, pour Command → Agents. Assemblé depuis les données
// existantes (users, demandes de serment, journal d'audit) — aucun schéma en plus.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const id = parseInt((await params).id, 10);
  const pool = await db();

  const { rows: urows } = await pool.query("SELECT matricule, codename, status, created_at FROM users WHERE id = $1", [id]);
  const u = urows[0];
  if (!u) return NextResponse.json({ error: "Unknown agent." }, { status: 404 });

  // The agent's current personnel file (prefer the active/unlocked one over a sealed archive)
  // so the sheet can link straight to it.
  const { rows: prow } = await pool.query(
    "SELECT id FROM documents WHERE owner_id = $1 AND is_personnel ORDER BY locked ASC, id DESC LIMIT 1",
    [id]
  );
  const fileId: number | null = prow[0]?.id ?? null;

  // Chaque demande de serment = une notification envoyée (la 1ʳᵉ, puis les relances).
  const { rows: reqs } = await pool.query(
    `SELECT r.status, r.created_at, r.completed_at, sg.status AS my_status, sg.signed_at
       FROM signature_requests r
       JOIN documents d ON d.id = r.doc_id AND d.is_personnel = true AND d.owner_id = $1
       JOIN signature_signers sg ON sg.request_id = r.id AND sg.user_id = $1
      ORDER BY r.created_at`,
    [id]
  );
  const { rows: logins } = await pool.query(
    "SELECT created_at FROM audit_log WHERE user_id = $1 AND action IN ('login','discord_login') ORDER BY created_at",
    [id]
  );
  const { rows: pwd } = await pool.query(
    "SELECT created_at FROM audit_log WHERE user_id = $1 AND action IN ('password_change','password_reset') ORDER BY created_at",
    [id]
  );

  const events: Ev[] = [];
  events.push({ at: u.created_at, kind: "created", label: "Account created" });
  reqs.forEach((r: any, i: number) => {
    events.push({ at: r.created_at, kind: "notify", label: i === 0 ? "Oath requested — notification sent" : "Oath reminder — notification sent" });
    if (r.my_status === "signed" && r.signed_at) events.push({ at: r.signed_at, kind: "signed", label: "Oath signed" });
    if (r.status === "complete" && r.completed_at) events.push({ at: r.completed_at, kind: "sealed", label: "File sealed (countersigned)" });
  });
  if (logins[0]) events.push({ at: logins[0].created_at, kind: "first_login", label: "First sign-in" });
  if (logins.length > 1) events.push({ at: logins[logins.length - 1].created_at, kind: "last_login", label: "Last sign-in" });
  pwd.forEach((p: any) => events.push({ at: p.created_at, kind: "password", label: "Password changed" }));
  events.sort((a, b) => +new Date(a.at) - +new Date(b.at));

  // Statut de serment courant, d'après la dernière demande.
  const latest = reqs[reqs.length - 1];
  let state = "none";
  let statusLabel = "No oath file";
  if (latest) {
    if (latest.status === "pending" && latest.my_status === "pending") { state = "to_sign"; statusLabel = "Oath to sign — access blocked"; }
    else if (latest.status === "complete") { state = "sealed"; statusLabel = "File sealed (countersigned)"; }
    else if (latest.my_status === "signed") { state = "signed"; statusLabel = "Signed — awaiting officer countersignature"; }
  }

  return NextResponse.json({
    agent: { matricule: u.matricule, codename: u.codename, status: u.status },
    state,
    statusLabel,
    summary: { notifs: reqs.length, logins: logins.length },
    events,
    fileId,
  });
}

// Exiger (à nouveau) la signature du dossier : purge les demandes en attente, régénère la
// fiche, relance le serment et notifie l'agent. Tant qu'il ne l'a pas signé, son accès au
// système est bloqué (voir lib/onboarding). requirePersonnelOath garantit UNE seule demande
// en attente, pour qu'une signature débloque bien l'agent.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const id = parseInt((await params).id, 10);
  const body = await req.json().catch(() => ({} as any));

  // Override : débloquer l'accès SANS signature (secours). On annule la demande de serment
  // en attente → l'agent n'est plus bloqué. Sert quand la signature coince ou pour un cas
  // particulier décidé par un officier.
  if (body?.override) {
    await voidPendingPersonnelRequests(id);
    audit(s, "onboarding_override", `user #${id} — access unblocked without signature`);
    return NextResponse.json({ ok: true, override: true });
  }

  // Regenerate the personnel file from the agent's current data (name, division, clearance),
  // WITHOUT re-issuing the oath or blocking access — a plain refresh of the document.
  if (body?.regenerate) {
    const f = await refreshPersonnelFile(id);
    audit(s, "personnel_file", `user #${id} regenerated${f ? "" : " (generation failed)"}`);
    return NextResponse.json({ ok: true, regenerated: !!f, docId: f?.docId ?? null });
  }

  // Otherwise: require (again) the file signature.
  const reqId = await requirePersonnelOath(id);
  audit(s, "personnel_file", `user #${id}${reqId ? "" : " (generation failed)"}`);
  return NextResponse.json({ ok: true, requested: reqId !== null });
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
    return NextResponse.json({ error: "You cannot delete an agent with clearance equal to or above your own." }, { status: 403 });
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
