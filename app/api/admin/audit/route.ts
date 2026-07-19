import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const action = (url.searchParams.get("action") || "").trim();
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT id, matricule, action, target, created_at FROM audit_log
     WHERE ($1 = '' OR matricule ILIKE '%'||$1||'%' OR target ILIKE '%'||$1||'%')
       AND ($2 = '' OR action = $2)
     ORDER BY created_at DESC LIMIT 300`,
    [q, action]
  );
  return NextResponse.json(rows);
}
