import { db, accessibleFolderIds } from "./db";
import type { Session } from "./session";

// ---- Permissions granulaires (façon Drive / Office) -----------------------
// Trois rôles, du plus faible au plus fort :
//   viewer  — lecture seule (ouvrir, lire, exporter le PDF)
//   editor  — + éditer / enregistrer, renommer
//   manager — + partager, déplacer, reclassifier, supprimer, desceller
// Le propriétaire d'un document et les officiers (role=admin) sont Gestionnaires d'office.
//
// Le rôle effectif d'un agent sur un document = le PLUS FORT parmi : son partage explicite,
// le rôle hérité d'un dossier parent dont il est membre, et — s'il a accès en lecture par
// son habilitation / un dossier ouvert — un plancher 'viewer'. `null` = aucun accès.

export type Role = "viewer" | "editor" | "manager";
const RANK: Record<Role, number> = { viewer: 1, editor: 2, manager: 3 };

export function atLeast(role: Role | null, min: Role): boolean {
  return role != null && RANK[role] >= RANK[min];
}
function stronger(a: Role | null, b: Role | null): Role | null {
  if (!a) return b;
  if (!b) return a;
  return RANK[a] >= RANK[b] ? a : b;
}
function asRole(v: unknown): Role | null {
  return v === "viewer" || v === "editor" || v === "manager" ? v : null;
}

type DocLike = { id: number; owner_id: number | null; folder_id: number | null; classification: number };

// Rôle effectif sur un document déjà chargé (évite un aller-retour SQL supplémentaire).
export async function docRole(doc: DocLike, session: Session): Promise<Role | null> {
  if (session.role === "admin") return "manager";
  if (doc.owner_id === session.id) return "manager";

  const pool = await db();
  let best: Role | null = null;

  // Partage explicite du document.
  const { rows: sh } = await pool.query(
    "SELECT role FROM document_shares WHERE doc_id = $1 AND user_id = $2",
    [doc.id, session.id]
  );
  if (sh[0]) best = stronger(best, asRole(sh[0].role));

  // Partage par division : l'agent hérite du rôle si sa division a un partage sur le document.
  const { rows: dsh } = await pool.query(
    `SELECT dds.role FROM document_division_shares dds
       JOIN users u ON u.id = $2
      WHERE dds.doc_id = $1 AND dds.division_id = u.division_id`,
    [doc.id, session.id]
  );
  if (dsh[0]) best = stronger(best, asRole(dsh[0].role));

  // Héritage : appartenance à un dossier parent (jusqu'à la racine).
  if (doc.folder_id) {
    const { rows: folders } = await pool.query("SELECT id, parent_id FROM folders");
    const byId = new Map<number, { id: number; parent_id: number | null }>(folders.map((f: any) => [f.id, f]));
    const { rows: mem } = await pool.query("SELECT folder_id, role FROM folder_members WHERE user_id = $1", [session.id]);
    const memRole = new Map<number, Role | null>(mem.map((m: any) => [m.folder_id, asRole(m.role)]));
    for (let cur = byId.get(doc.folder_id); cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) {
      if (memRole.has(cur.id)) best = stronger(best, memRole.get(cur.id)!);
    }
  }

  // Plancher lecture : habilitation suffisante ET dossier atteignable → au moins viewer.
  const clearanceOk = doc.classification <= session.clearance;
  if (clearanceOk) {
    const folderOk = !doc.folder_id || (await accessibleFolderIds(session.id, session.role)).includes(doc.folder_id);
    if (folderOk) best = stronger(best, "viewer");
  }

  return best;
}

// Rôle effectif sur un dossier (pour renommer / supprimer / gérer les membres).
// Le créateur du dossier et les officiers sont Gestionnaires.
export async function folderRole(folderId: number, session: Session): Promise<Role | null> {
  if (session.role === "admin") return "manager";
  const pool = await db();
  const { rows } = await pool.query("SELECT created_by FROM folders WHERE id = $1", [folderId]);
  if (!rows[0]) return null;
  if (rows[0].created_by === session.id) return "manager";

  let best: Role | null = null;
  const { rows: folders } = await pool.query("SELECT id, parent_id FROM folders");
  const byId = new Map<number, { id: number; parent_id: number | null }>(folders.map((f: any) => [f.id, f]));
  const { rows: mem } = await pool.query("SELECT folder_id, role FROM folder_members WHERE user_id = $1", [session.id]);
  const memRole = new Map<number, Role | null>(mem.map((m: any) => [m.folder_id, asRole(m.role)]));
  for (let cur = byId.get(folderId); cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) {
    if (memRole.has(cur.id)) best = stronger(best, memRole.get(cur.id)!);
  }
  // Un dossier atteignable mais sans rôle explicite → viewer (peut le parcourir).
  if (!best) {
    const ok = (await accessibleFolderIds(session.id, session.role)).includes(folderId);
    if (ok) best = "viewer";
  }
  return best;
}

// Normalise une valeur de rôle reçue d'un formulaire (défaut : viewer).
export function normalizeRole(v: unknown): Role {
  return asRole(v) ?? "viewer";
}
