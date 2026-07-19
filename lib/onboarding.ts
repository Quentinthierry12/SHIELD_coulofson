import { db, refreshPersonnelFile } from "./db";
import { requestSignature } from "./signatures";
import { dmByUserId } from "./discord";
import { personnelFilePush } from "./push";
import type { Session } from "./session";

// ---- Circuit administratif obligatoire -----------------------------------
// Chaque agent doit lire et signer le serment sur SON PROPRE dossier avant de
// pouvoir utiliser le système. Tant que ce n'est pas fait, toutes les autres
// features sont bloquées (redirection vers /onboarding). Les officiers/admins
// ne sont jamais concernés. Le déblocage est immédiat dès que l'agent signe :
// on lit la base en direct, sans dépendre du jeton de session.

const OATH_NOTE = "Personnel file — read and sign your oath of service.";

// La demande de serment en attente POUR cet agent sur son propre dossier, s'il y en a
// une. C'est le verrou léger, appelé à chaque chargement de page.
export async function pendingPersonnelRequestId(userId: number): Promise<number | null> {
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT r.id FROM signature_requests r
       JOIN documents d ON d.id = r.doc_id AND d.is_personnel = true AND d.owner_id = $1
       JOIN signature_signers sg ON sg.request_id = r.id AND sg.user_id = $1
      WHERE r.status = 'pending' AND sg.status = 'pending'
      ORDER BY r.created_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0]?.id ?? null;
}

// Faut-il bloquer cet agent ? (admins jamais)
export async function needsOnboarding(session: Session): Promise<boolean> {
  if (session.role === "admin") return false;
  return (await pendingPersonnelRequestId(session.id)) !== null;
}

// A-t-il déjà signé son serment par le passé ? Alors on ne le re-bloque jamais,
// même si le dossier a été régénéré depuis.
async function hasSignedOath(userId: number): Promise<boolean> {
  const pool = await db();
  const { rowCount } = await pool.query(
    `SELECT 1 FROM signature_signers sg
       JOIN signature_requests r ON r.id = sg.request_id
       JOIN documents d ON d.id = r.doc_id AND d.is_personnel = true AND d.owner_id = $1
      WHERE sg.user_id = $1 AND sg.status = 'signed' LIMIT 1`,
    [userId]
  );
  return !!rowCount;
}

// À la connexion (déploiement rétroactif : « bloqué au prochain login ») : si l'agent
// n'a jamais signé et n'a pas de demande ouverte, on génère son dossier, on lance la
// demande de serment et on envoie la notif dédiée. Idempotent et sans effet pour les
// admins, ceux déjà en règle, ou ceux ayant déjà une demande en cours. Ne jette jamais :
// un échec de génération ne doit ni bloquer le login ni enfermer l'agent sans dossier.
export async function ensurePersonnelOnboarding(session: Session): Promise<void> {
  try {
    if (session.role === "admin") return;
    if (await pendingPersonnelRequestId(session.id)) return; // déjà une demande ouverte
    if (await hasSignedOath(session.id)) return; // déjà en règle
    const f = await refreshPersonnelFile(session.id);
    if (!f) return; // génération impossible → on ne bloque pas
    const reqId = await requestSignature({
      docId: f.docId,
      signerIds: [session.id],
      requestedBy: null,
      circuit: "admin",
      sequential: true,
      note: OATH_NOTE,
    });
    if (reqId) {
      dmByUserId(
        session.id,
        `🦅 **S.H.I.E.L.D. — DOSSIER D'AGENT** — Signe ton serment de service pour accéder au système. ${process.env.PORTAL_URL}/onboarding`,
        personnelFilePush()
      );
    }
  } catch {
    /* le login ne doit jamais casser sur l'onboarding */
  }
}
