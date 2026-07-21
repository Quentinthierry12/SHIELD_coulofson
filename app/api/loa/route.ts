import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { loaState } from "@/lib/loa";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// An agent's own leaves of absence.
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT id, to_char(start_date,'YYYY-MM-DD') AS start_date, to_char(end_date,'YYYY-MM-DD') AS end_date, reason
       FROM loa WHERE user_id = $1 AND status = 'active' ORDER BY start_date DESC`,
    [s.id]
  );
  return NextResponse.json(rows.map((r: any) => ({ ...r, state: loaState(r.start_date, r.end_date) })));
}

// Declare a leave of absence (auto-active — no approval step).
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { start_date, end_date, reason } = await req.json();
  if (!DATE_RE.test(start_date || "") || !DATE_RE.test(end_date || "")) {
    return NextResponse.json({ error: "Start and end dates are required." }, { status: 400 });
  }
  if (end_date < start_date) {
    return NextResponse.json({ error: "The end date cannot be before the start date." }, { status: 400 });
  }
  const pool = await db();
  const { rows } = await pool.query(
    "INSERT INTO loa (user_id, start_date, end_date, reason, created_by) VALUES ($1, $2, $3, $4, $1) RETURNING id",
    [s.id, start_date, end_date, (reason || "").trim() || null]
  );
  audit(s, "loa_declare", `${start_date} → ${end_date}`);
  return NextResponse.json({ id: rows[0].id });
}
