import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { readFile } from "fs/promises";
import path from "path";

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
    ALTER TABLE users ADD COLUMN IF NOT EXISTS discord_id TEXT;
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
    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      filetype TEXT NOT NULL,
      content BYTEA NOT NULL,
      created_by INT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Seed the built-in Agent Personnel File template on first run.
  const tpl = await pool.query("SELECT COUNT(*)::int AS n FROM templates");
  if (tpl.rows[0].n === 0) {
    try {
      const content = await readFile(path.join(process.cwd(), "templates", "personnel-file.docx"));
      await pool.query(
        "INSERT INTO templates (name, filetype, content) VALUES ($1, 'docx', $2)",
        ["Agent Personnel File", content]
      );
    } catch {}
  }
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM users");
  if (rows[0].n === 0) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || "fury1951", 10);
    await pool.query(
      `INSERT INTO users (matricule, codename, password_hash, clearance, role, status)
       VALUES ('DIRECTOR', 'Directeur', $1, 10, 'admin', 'active')`,
      [hash]
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

// Accès à un document : niveau d'habilitation suffisant, propriétaire, admin, ou partage explicite —
// ET accès au dossier qui le contient.
export async function getAccessibleDoc(docId: number, clearance: number, userId: number, role: string) {
  const p = await db();
  const { rows } = await p.query(
    `SELECT d.* FROM documents d
     WHERE d.id = $1 AND (d.classification <= $2 OR d.owner_id = $3 OR $4 = 'admin'
       OR EXISTS (SELECT 1 FROM document_shares s WHERE s.doc_id = d.id AND s.user_id = $3))`,
    [docId, clearance, userId, role]
  );
  const doc = rows[0];
  if (!doc) return null;
  if (doc.folder_id && role !== "admin") {
    const ids = await accessibleFolderIds(userId, role);
    if (!ids.includes(doc.folder_id)) return null;
  }
  return doc;
}

// Every new account gets an administrative personnel file, classified level 10:
// only the agent themself (owner) and officers can see it. Its destination folder
// is configurable from the Command settings (key: personnel_folder_id).
export async function createPersonnelFile(userId: number, matricule: string, codename: string) {
  try {
    const template = await readFile(path.join(process.cwd(), "templates", "personnel-file.docx"));
    const folderId = parseInt((await getSetting("personnel_folder_id")) || "", 10) || null;
    const p = await db();
    await p.query(
      `INSERT INTO documents (title, filetype, classification, owner_id, content, folder_id)
       VALUES ($1, 'docx', 10, $2, $3, $4)`,
      [`PERSONNEL FILE — ${matricule} (${codename})`, userId, template, folderId]
    );
  } catch {} // ponytail: missing template must never block account creation
}
