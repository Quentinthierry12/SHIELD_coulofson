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
//
// Le verrou se base UNIQUEMENT sur la demande de serment la plus récente de
// l'agent. C'est volontaire : régénérer un dossier verrouillé crée un nouveau
// document (refreshPersonnelFile), donc plusieurs demandes en attente peuvent
// coexister. Regarder « la dernière » garantit qu'une signature débloque bien
// (sinon une vieille demande orpheline continuait de bloquer après signature),
// tout en laissant « Exiger signature » re-bloquer via une nouvelle demande.

const OATH_NOTE = "Personnel file — read and sign your oath of service.";

type LatestReq = { id: number; status: string; my_status: string };

// La demande de serment la plus récente de l'agent sur son propre dossier (peu importe
// son état), ou null s'il n'en a jamais eu.
async function latestPersonnelRequest(userId: number): Promise<LatestReq | null> {
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT r.id, r.status, sg.status AS my_status
       FROM signature_requests r
       JOIN documents d ON d.id = r.doc_id AND d.is_personnel = true AND d.owner_id = $1
       JOIN signature_signers sg ON sg.request_id = r.id AND sg.user_id = $1
      ORDER BY r.created_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] ?? null;
}

// La demande de serment que l'agent doit encore signer (verrou léger, appelé à chaque
// chargement de page). Null s'il est en règle.
export async function pendingPersonnelRequestId(userId: number): Promise<number | null> {
  const r = await latestPersonnelRequest(userId);
  return r && r.status === "pending" && r.my_status === "pending" ? r.id : null;
}

// Faut-il bloquer cet agent ? (admins jamais)
export async function needsOnboarding(session: Session): Promise<boolean> {
  if (session.role === "admin") return false;
  return (await pendingPersonnelRequestId(session.id)) !== null;
}

// Annule toutes les demandes de serment EN ATTENTE de l'agent et déverrouille les
// documents correspondants. Appelé avant d'en lancer une nouvelle, pour ne jamais
// empiler plusieurs demandes en attente (et pour que refreshPersonnelFile réutilise
// le document au lieu d'en créer un neuf parce que l'ancien était verrouillé).
export async function voidPendingPersonnelRequests(userId: number): Promise<void> {
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT r.id, r.doc_id FROM signature_requests r
       JOIN documents d ON d.id = r.doc_id AND d.is_personnel = true AND d.owner_id = $1
      WHERE r.status = 'pending'`,
    [userId]
  );
  for (const r of rows) {
    await pool.query("UPDATE signature_requests SET status = 'cancelled', completed_at = now() WHERE id = $1", [r.id]);
    await pool.query("UPDATE documents SET locked = false WHERE id = $1", [r.doc_id]);
  }
}

// Lance (ou relance) la demande de serment pour l'agent : purge les demandes en attente,
// régénère le dossier, lève une nouvelle demande et notifie. Renvoie l'id de la demande,
// ou null si la génération a échoué (auquel cas on ne bloque pas l'agent).
export async function requirePersonnelOath(userId: number): Promise<number | null> {
  await voidPendingPersonnelRequests(userId);
  const f = await refreshPersonnelFile(userId);
  if (!f) return null;
  const reqId = await requestSignature({
    docId: f.docId,
    signerIds: [userId],
    requestedBy: null,
    circuit: "admin",
    sequential: true,
    note: OATH_NOTE,
  });
  if (reqId) {
    dmByUserId(
      userId,
      `🦅 **S.H.I.E.L.D. — PERSONNEL FILE** — Sign your oath of service to access the system. ${process.env.PORTAL_URL}/onboarding`,
      personnelFilePush()
    );
  }
  return reqId;
}

// À la connexion (déploiement rétroactif : « bloqué au prochain login ») : si l'agent
// n'a AUCUNE demande de serment (jamais généré), on la crée. S'il en a déjà une (en
// attente → il devra signer ; signée → il est en règle), on ne touche à rien. Idempotent,
// sans effet pour les admins. Ne jette jamais : un échec ne doit pas casser le login.
export async function ensurePersonnelOnboarding(session: Session): Promise<void> {
  try {
    if (session.role === "admin") return;
    if (await latestPersonnelRequest(session.id)) return; // déjà une demande (en cours ou signée)
    await requirePersonnelOath(session.id);
  } catch {
    /* le login ne doit jamais casser sur l'onboarding */
  }
}
