import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { deleteMoodleUser } from "@/lib/moodle";
import { requirePersonnelOath } from "@/lib/onboarding";

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
  events.push({ at: u.created_at, kind: "created", label: "Compte créé" });
  reqs.forEach((r: any, i: number) => {
    events.push({ at: r.created_at, kind: "notify", label: i === 0 ? "Serment demandé — notification envoyée" : "Relance du serment — notification envoyée" });
    if (r.my_status === "signed" && r.signed_at) events.push({ at: r.signed_at, kind: "signed", label: "Serment signé" });
    if (r.status === "complete" && r.completed_at) events.push({ at: r.completed_at, kind: "sealed", label: "Dossier scellé (contresigné)" });
  });
  if (logins[0]) events.push({ at: logins[0].created_at, kind: "first_login", label: "1ʳᵉ connexion" });
  if (logins.length > 1) events.push({ at: logins[logins.length - 1].created_at, kind: "last_login", label: "Dernière connexion" });
  pwd.forEach((p: any) => events.push({ at: p.created_at, kind: "password", label: "Mot de passe changé" }));
  events.sort((a, b) => +new Date(a.at) - +new Date(b.at));

  // Statut de serment courant, d'après la dernière demande.
  const latest = reqs[reqs.length - 1];
  let state = "none";
  let statusLabel = "Aucun dossier de serment";
  if (latest) {
    if (latest.status === "pending" && latest.my_status === "pending") { state = "to_sign"; statusLabel = "Serment à signer — accès bloqué"; }
    else if (latest.status === "complete") { state = "sealed"; statusLabel = "Dossier scellé (contresigné)"; }
    else if (latest.my_status === "signed") { state = "signed"; statusLabel = "Signé — en attente de contreseing officier"; }
  }

  return NextResponse.json({
    agent: { matricule: u.matricule, codename: u.codename, status: u.status },
    state,
    statusLabel,
    summary: { notifs: reqs.length, logins: logins.length },
    events,
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
  const reqId = await requirePersonnelOath(id);
  audit(s, "personnel_file", `user #${id}${reqId ? "" : " (génération impossible)"}`);
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
