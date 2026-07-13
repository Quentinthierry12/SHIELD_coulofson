import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// Autocomplétion pour le partage : cherche parmi les agents actifs.
export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json([]);
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT matricule, codename, clearance FROM users
     WHERE status = 'active' AND id != $2 AND (codename ILIKE $1 OR matricule ILIKE $1)
     ORDER BY codename LIMIT 8`,
    [q + "%", s.id]
  );
  return NextResponse.json(rows);
}
