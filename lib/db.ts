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
