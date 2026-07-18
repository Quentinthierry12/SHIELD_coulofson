import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// The S.H.I.E.L.D. roster — visible to any signed-in agent.
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT u.matricule, u.codename, u.clearance, u.role,
            COALESCE(dv.name, '') AS division,
            (dv.lead_id = u.id) AS is_lead
       FROM users u LEFT JOIN divisions dv ON dv.id = u.division_id
      WHERE u.status = 'active'
      ORDER BY dv.name NULLS FIRST, u.clearance DESC, u.codename`
  );
  return NextResponse.json(rows);
}
