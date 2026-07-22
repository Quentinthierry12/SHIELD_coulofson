import { NextResponse } from "next/server";
import { brand, dmPrefix } from "@/lib/brand";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";
import { loaState } from "@/lib/loa";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Absence board for officers: everyone's current and upcoming leaves.
export async function GET() {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT l.id, l.user_id, u.matricule, u.codename, COALESCE(dv.name, '') AS division,
            to_char(l.start_date,'YYYY-MM-DD') AS start_date, to_char(l.end_date,'YYYY-MM-DD') AS end_date, l.reason
       FROM loa l JOIN users u ON u.id = l.user_id LEFT JOIN divisions dv ON dv.id = u.division_id
      WHERE l.status = 'active' AND l.end_date >= CURRENT_DATE
      ORDER BY l.start_date`
  );
  return NextResponse.json(rows.map((r: any) => ({ ...r, state: loaState(r.start_date, r.end_date) })));
}

// Set a leave of absence for any agent (remote control).
export async function POST(req: Request) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const { matricule, start_date, end_date, reason } = await req.json();
  if (!DATE_RE.test(start_date || "") || !DATE_RE.test(end_date || "")) {
    return NextResponse.json({ error: "Start and end dates are required." }, { status: 400 });
  }
  if (end_date < start_date) {
    return NextResponse.json({ error: "The end date cannot be before the start date." }, { status: 400 });
  }
  const pool = await db();
  const { rows: u } = await pool.query("SELECT id, codename FROM users WHERE matricule = $1 AND status = 'active'", [
    (matricule || "").trim().toUpperCase(),
  ]);
  if (!u[0]) return NextResponse.json({ error: "Unknown badge or inactive agent." }, { status: 404 });
  const { rows } = await pool.query(
    "INSERT INTO loa (user_id, start_date, end_date, reason, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [u[0].id, start_date, end_date, (reason || "").trim() || null, s.id]
  );
  audit(s, "loa_set", `${(matricule || "").trim().toUpperCase()} ${start_date} → ${end_date}`);
  dmByUserId(
    u[0].id,
    `${dmPrefix()} — Command registered a **leave of absence** for you: ${start_date} → ${end_date}${reason ? ` (${reason})` : ""}.`,
    { title: `${brand.short} — Leave of absence`, body: `Leave registered: ${start_date} → ${end_date}`, url: "/loa", tag: "loa" }
  );
  return NextResponse.json({ id: rows[0].id, codename: u[0].codename });
}
