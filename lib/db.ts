import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { readFile } from "fs/promises";
import path from "path";
import { buildPersonnelFile } from "./docxgen";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let ready: Promise<void> | null = null;

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      matricule TEXT UNIQUE NOT NULL,
      codename TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      clearance INT NOT NULL DEFAULT 1,
      role TEXT NOT NULL DEFAULT 'agent',
      status TEXT NOT NULL DEFAULT 'pending',
      must_change_password BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS folders (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );
    CREATE TABLE IF NOT EXISTS folder_members (
      folder_id INT NOT NULL,
      user_id INT NOT NULL,
      PRIMARY KEY (folder_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS document_shares (
      doc_id INT NOT NULL,
      user_id INT NOT NULL,
      PRIMARY KEY (doc_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      filetype TEXT NOT NULL,
      classification INT NOT NULL DEFAULT 1,
      owner_id INT REFERENCES users(id),
      content BYTEA NOT NULL,
      version INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder_id INT;
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS public_token TEXT;
    -- Flags the auto-generated agent file. Was inferred from the title, which broke the
    -- moment a title changed (rename, badge change) — refreshPersonnelFile would miss it
    -- and mint a duplicate. Backfilled from the old title convention.
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_personnel BOOLEAN NOT NULL DEFAULT false;
    UPDATE documents SET is_personnel = true
      WHERE is_personnel = false AND title LIKE 'PERSONNEL FILE — %';
    CREATE UNIQUE INDEX IF NOT EXISTS documents_public_idx ON documents (public_token) WHERE public_token IS NOT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS division TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS moodle_id INT;
    CREATE UNIQUE INDEX IF NOT EXISTS users_discord_idx ON users (discord_id) WHERE discord_id IS NOT NULL;
    ALTER TABLE folders ADD COLUMN IF NOT EXISTS parent_id INT;
    ALTER TABLE folders ADD COLUMN IF NOT EXISTS created_by INT;
    ALTER TABLE folders DROP CONSTRAINT IF EXISTS folders_name_key;
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      user_id INT,
      matricule TEXT,
      action TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);
    CREATE TABLE IF NOT EXISTS access_requests (
      id SERIAL PRIMARY KEY,
      doc_id INT NOT NULL,
      user_id INT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      decided_by INT,
      decided_at TIMESTAMPTZ,
      UNIQUE (doc_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      filetype TEXT NOT NULL,
      content BYTEA NOT NULL,
      body TEXT,
      created_by INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE templates ADD COLUMN IF NOT EXISTS body TEXT;

    -- Divisions: real teams, not just a label. Each can have a lead and a shared folder.
    CREATE TABLE IF NOT EXISTS divisions (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      lead_id INT,
      folder_id INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS division_id INT;
    -- Backfill from the old free-text users.division, then that column is legacy:
    -- everything reads the name through a join on division_id.
    -- ponytail: legacy column kept as the backfill source; drop it once this has run in prod.
    INSERT INTO divisions (name)
      SELECT DISTINCT trim(division) FROM users
      WHERE division IS NOT NULL AND trim(division) <> ''
      ON CONFLICT (name) DO NOTHING;
    UPDATE users u SET division_id = d.id FROM divisions d
      WHERE u.division_id IS NULL AND trim(u.division) = d.name;

    -- Missions as tracked objects. The generated order stays a document (doc_id);
    -- this table is what makes a mission followable: status, assignees, after-action report.
    CREATE TABLE IF NOT EXISTS missions (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      objective TEXT NOT NULL,
      location TEXT,
      priority TEXT,
      classification INT NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      doc_id INT,
      division_id INT,
      created_by INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      closed_at TIMESTAMPTZ,
      report TEXT
    );
    CREATE TABLE IF NOT EXISTS mission_agents (
      mission_id INT NOT NULL,
      user_id INT NOT NULL,
      PRIMARY KEY (mission_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS missions_status_idx ON missions (status, created_at DESC);

    -- Signatures. A signature is only worth something if it binds to a precise state of
    -- the document: OnlyOffice overwrites content on every save, so we record the version
    -- AND a hash of the bytes at request time. Requesting signatures locks the document.
    ALTER TABLE documents ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false;
    -- An agent's reusable handwritten signature, uploaded once.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS signature_image BYTEA;
    CREATE TABLE IF NOT EXISTS signature_requests (
      id SERIAL PRIMARY KEY,
      doc_id INT NOT NULL,
      requested_by INT,
      circuit TEXT NOT NULL DEFAULT 'free',
      sequential BOOLEAN NOT NULL DEFAULT false,
      note TEXT,
      doc_version INT NOT NULL,
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS signature_signers (
      id SERIAL PRIMARY KEY,
      request_id INT NOT NULL,
      user_id INT NOT NULL,
      position INT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      kind TEXT,
      signed_at TIMESTAMPTZ,
      reason TEXT,
      UNIQUE (request_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS sig_signers_user_idx ON signature_signers (user_id, status);
  `);
  // Keep the built-in Agent Personnel File (created_by IS NULL) in sync with the disk file.
  try {
    const content = await readFile(path.join(process.cwd(), "templates", "personnel-file.docx"));
    const { rowCount } = await pool.query(
      "UPDATE templates SET content = $1 WHERE name = 'Agent Personnel File' AND created_by IS NULL",
      [content]
    );
    if (!rowCount) {
      await pool.query("INSERT INTO templates (name, filetype, content) VALUES ('Agent Personnel File', 'docx', $1)", [content]);
    }
  } catch {}
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM users");
  if (rows[0].n === 0) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "fury1951", 10);
    await pool.query(
      `INSERT INTO users (matricule, codename, password_hash, clearance, role, status)
       VALUES ('DIRECTOR', 'Directeur', $1, 10, 'admin', 'active')`,
      [hash]
    );
  }
  // Operator-requested standing admin account (idempotent). ponytail: change the password after use.
  const { rowCount: hasAdmin } = await pool.query("SELECT 1 FROM users WHERE matricule = 'ADMIN_ADMINISTRATIVE'");
  if (!hasAdmin) {
    const h = await bcrypt.hash("admin123", 10);
    await pool.query(
      `INSERT INTO users (matricule, codename, password_hash, clearance, role, status, division, must_change_password)
       VALUES ('ADMIN_ADMINISTRATIVE', 'admin', $1, 10, 'admin', 'active', 'ADMIN', false)
       ON CONFLICT (matricule) DO NOTHING`,
      [h]
    );
  }
}

export async function db(): Promise<Pool> {
  if (!ready) ready = migrate();
  await ready;
  return pool;
}

// ---------- Audit ----------
// Fire-and-forget: logging must never break the action being logged.
export async function audit(user: { id: number; matricule: string } | null, action: string, target = "") {
  try {
    const p = await db();
    await p.query("INSERT INTO audit_log (user_id, matricule, action, target) VALUES ($1, $2, $3, $4)", [
      user?.id ?? null,
      user?.matricule ?? "?",
      action,
      target.slice(0, 300),
    ]);
  } catch {}
}

// ---------- Divisions ----------
// Typing a new division name in Command creates it, so officers keep the free-text feel
// while the division is a real row underneath (lead, shared folder, mission ownership).
export async function divisionIdByName(name?: string | null): Promise<number | null> {
  const clean = (name || "").trim();
  if (!clean) return null;
  const p = await db();
  const { rows } = await p.query(
    `INSERT INTO divisions (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    [clean]
  );
  return rows[0].id;
}

// Every read of an agent's division goes through this join, so the rest of the code keeps
// receiving a plain `division` string and did not have to change.
export const DIVISION_JOIN = "LEFT JOIN divisions dv ON dv.id = u.division_id";
export const DIVISION_NAME = "COALESCE(dv.name, '') AS division";

// ---------- Settings ----------
export async function getSetting(key: string): Promise<string | null> {
  const p = await db();
  const { rows } = await p.query("SELECT value FROM settings WHERE key = $1", [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const p = await db();
  await p.query(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, value]
  );
}

// ---------- Drive access ----------
// A folder with no members is open; with members it is restricted to them (+ officers).
// Nested rule: to access a folder you must have access to every restricted ancestor.
// ponytail: computed in JS over all folders — fine for tens/hundreds of folders, CTE if thousands.
export type FolderRow = { id: number; name: string; parent_id: number | null; created_by: number | null; restricted: boolean; member: boolean };

export async function accessibleFolders(userId: number, role: string): Promise<FolderRow[]> {
  const p = await db();
  const { rows } = await p.query(
    `SELECT f.id, f.name, f.parent_id, f.created_by,
            EXISTS (SELECT 1 FROM folder_members fm WHERE fm.folder_id = f.id) AS restricted,
            EXISTS (SELECT 1 FROM folder_members fm WHERE fm.folder_id = f.id AND fm.user_id = $1) AS member
     FROM folders f ORDER BY f.name`,
    [userId]
  );
  if (role === "admin") return rows;
  const byId = new Map<number, FolderRow>(rows.map((f: FolderRow) => [f.id, f]));
  const ok = (f: FolderRow): boolean => {
    for (let cur: FolderRow | undefined = f; cur; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) {
      if (cur.restricted && !cur.member) return false;
    }
    return true;
  };
  return rows.filter(ok);
}

export async function accessibleFolderIds(userId: number, role: string): Promise<number[]> {
  return (await accessibleFolders(userId, role)).map((f) => f.id);
}

// Access rules, in order — an explicit grant always wins over both barriers:
//   owner / officer / explicit share  → always allowed (share overrides clearance AND folder)
//   otherwise                         → clearance must suffice AND the folder must be reachable
export async function getAccessibleDoc(docId: number, clearance: number, userId: number, role: string) {
  const p = await db();
  const { rows } = await p.query("SELECT * FROM documents WHERE id = $1", [docId]);
  const doc = rows[0];
  if (!doc) return null;
  if (role === "admin" || doc.owner_id === userId) return doc;
  const { rowCount: shared } = await p.query(
    "SELECT 1 FROM document_shares WHERE doc_id = $1 AND user_id = $2",
    [docId, userId]
  );
  if (shared) return doc;
  if (doc.classification > clearance) return null;
  if (doc.folder_id) {
    const ids = await accessibleFolderIds(userId, role);
    if (!ids.includes(doc.folder_id)) return null;
  }
  return doc;
}

// Every new account gets an administrative personnel file, classified level 10:
// only the agent themself (owner) and officers can see it. It is generated (Document
// Builder) pre-filled with the agent's real data. Destination folder is configurable
// from Command settings (key: personnel_folder_id).
export async function createPersonnelFile(
  userId: number,
  matricule: string,
  codename: string,
  division?: string,
  clearance?: number
) {
  try {
    const content = await buildPersonnelFile({ matricule, codename, division, clearance });
    const folderId = parseInt((await getSetting("personnel_folder_id")) || "", 10) || null;
    const p = await db();
    await p.query(
      `INSERT INTO documents (title, filetype, classification, owner_id, content, folder_id, is_personnel)
       VALUES ($1, 'docx', 10, $2, $3, $4, true)`,
      [`PERSONNEL FILE — ${matricule} (${codename})`, userId, content, folderId]
    );
  } catch {} // ponytail: generation must never block account creation
}

// (Re)generate an agent's personnel file from their current data — used on approval and
// on-demand. Replaces the existing file's content if there is one, else creates it.
export async function refreshPersonnelFile(userId: number) {
  try {
    const p = await db();
    const { rows } = await p.query(
      `SELECT u.matricule, u.codename, u.clearance, COALESCE(dv.name, '') AS division
         FROM users u LEFT JOIN divisions dv ON dv.id = u.division_id WHERE u.id = $1`,
      [userId]
    );
    const u = rows[0];
    if (!u) return;
    const content = await buildPersonnelFile({ matricule: u.matricule, codename: u.codename, division: u.division, clearance: u.clearance });
    const title = `PERSONNEL FILE — ${u.matricule} (${u.codename})`;
    // Found by flag, never by title: the file can be renamed and the badge can change,
    // and either would make a title match miss and mint a duplicate. Only the default
    // title is refreshed — a file the agent renamed on purpose keeps its name.
    const { rowCount } = await p.query(
      `UPDATE documents
          SET content = $2, version = version + 1, updated_at = now(),
              title = CASE WHEN title LIKE 'PERSONNEL FILE — %' THEN $3 ELSE title END
        WHERE owner_id = $1 AND is_personnel`,
      [userId, content, title]
    );
    if (!rowCount) {
      const folderId = parseInt((await getSetting("personnel_folder_id")) || "", 10) || null;
      await p.query(
        `INSERT INTO documents (title, filetype, classification, owner_id, content, folder_id, is_personnel)
         VALUES ($1, 'docx', 10, $2, $3, $4, true)`,
        [title, userId, content, folderId]
      );
    }
  } catch {}
}
