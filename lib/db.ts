import { Pool } from "pg";
import bcrypt from "bcryptjs";

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
  `);
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

// Un salon sans membre est ouvert à tous ; avec membres, il est restreint à ceux-ci (+ officiers).
export const FOLDER_ACCESS_SQL = `(d.folder_id IS NULL OR $4 = 'admin'
  OR NOT EXISTS (SELECT 1 FROM folder_members fm WHERE fm.folder_id = d.folder_id)
  OR EXISTS (SELECT 1 FROM folder_members fm WHERE fm.folder_id = d.folder_id AND fm.user_id = $3))`;

// Accès à un document : niveau d'habilitation suffisant, propriétaire, admin, ou partage explicite —
// ET accès au salon qui le contient.
export async function getAccessibleDoc(docId: number, clearance: number, userId: number, role: string) {
  const p = await db();
  const { rows } = await p.query(
    `SELECT d.* FROM documents d
     WHERE d.id = $1 AND (d.classification <= $2 OR d.owner_id = $3 OR $4 = 'admin'
       OR EXISTS (SELECT 1 FROM document_shares s WHERE s.doc_id = d.id AND s.user_id = $3))
       AND ${FOLDER_ACCESS_SQL}`,
    [docId, clearance, userId, role]
  );
  return rows[0] || null;
}
