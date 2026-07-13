import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// The S.H.I.E.L.D. roster — visible to any signed-in agent.
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT matricule, codename, clearance, role, COALESCE(division, '') AS division
     FROM users WHERE status = 'active'
     ORDER BY division NULLS FIRST, clearance DESC, codename`
  );
  return NextResponse.json(rows);
}
