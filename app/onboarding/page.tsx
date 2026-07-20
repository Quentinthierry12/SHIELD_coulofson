import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { needsOnboarding, pendingPersonnelRequestId } from "@/lib/onboarding";
import { db } from "@/lib/db";
import OnboardingUI from "./ui";

// Écran d'accueil obligatoire : l'agent lit et signe son serment avant tout le reste.
export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");
  // Déjà en règle (ou officier) → rien à faire ici.
  if (!(await needsOnboarding(session))) redirect("/dashboard");

  const reqId = await pendingPersonnelRequestId(session.id);
  const pool = await db();
  const { rows } = await pool.query(
    "SELECT r.id, r.doc_id, d.title FROM signature_requests r JOIN documents d ON d.id = r.doc_id WHERE r.id = $1",
    [reqId]
  );
  const req = rows[0];
  if (!req) redirect("/dashboard");

  return (
    <OnboardingUI
      session={{ matricule: session.matricule, codename: session.codename, clearance: session.clearance }}
      requestId={req.id}
      docId={req.doc_id}
      title={req.title}
    />
  );
}
