import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// Officer command overview: everything that needs an officer's attention, on one screen.
// All aggregates come from existing tables — no extra schema.
export async function GET() {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const pool = await db();

  const [sig, sigList, missions, agents, blocked, inactive, inactiveList, access, onLeave, recent] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS n FROM signature_requests WHERE status = 'pending'"),
    // Open requests, most stalled first, with progress.
    pool.query(
      `SELECT r.id, r.doc_id, d.title, r.created_at,
              (SELECT COUNT(*) FROM signature_signers sg WHERE sg.request_id = r.id AND sg.status = 'signed')::int AS signed,
              (SELECT COUNT(*) FROM signature_signers sg WHERE sg.request_id = r.id)::int AS total
         FROM signature_requests r JOIN documents d ON d.id = r.doc_id
        WHERE r.status = 'pending' ORDER BY r.created_at ASC LIMIT 6`
    ),
    pool.query("SELECT status, COUNT(*)::int AS n FROM missions GROUP BY status"),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active')::int AS active,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending FROM users`
    ),
    // Agents locked out of the system until they sign their oath.
    pool.query(
      `SELECT COUNT(*)::int AS n FROM users u
        WHERE u.status = 'active' AND EXISTS (
          SELECT 1 FROM signature_requests r
            JOIN documents d ON d.id = r.doc_id AND d.is_personnel AND d.owner_id = u.id
            JOIN signature_signers sg ON sg.request_id = r.id AND sg.user_id = u.id
           WHERE r.status = 'pending' AND sg.status = 'pending')`
    ),
    // Active non-officers with no sign-in in the last 14 days.
    pool.query(
      `SELECT COUNT(*)::int AS n FROM users u
        WHERE u.status = 'active' AND u.role <> 'admin' AND NOT EXISTS (
          SELECT 1 FROM audit_log a WHERE a.user_id = u.id
            AND a.action IN ('login','discord_login') AND a.created_at > now() - interval '14 days')`
    ),
    pool.query(
      `SELECT u.matricule, u.codename,
              (SELECT MAX(a.created_at) FROM audit_log a WHERE a.user_id = u.id AND a.action IN ('login','discord_login')) AS last_login
         FROM users u
        WHERE u.status = 'active' AND u.role <> 'admin' AND NOT EXISTS (
          SELECT 1 FROM audit_log a WHERE a.user_id = u.id
            AND a.action IN ('login','discord_login') AND a.created_at > now() - interval '14 days')
        ORDER BY last_login ASC NULLS FIRST LIMIT 6`
    ),
    pool.query("SELECT COUNT(*)::int AS n FROM access_requests WHERE status = 'pending'"),
    pool.query("SELECT COUNT(*)::int AS n FROM loa WHERE status = 'active' AND start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE"),
    pool.query("SELECT created_at, matricule, action, target FROM audit_log ORDER BY created_at DESC LIMIT 12"),
  ]);

  const m: Record<string, number> = {};
  for (const row of missions.rows as { status: string; n: number }[]) m[row.status] = row.n;

  return NextResponse.json({
    signatures: { pending: sig.rows[0].n, list: sigList.rows },
    missions: { active: m.active || 0, completed: m.completed || 0, aborted: m.aborted || 0 },
    agents: { active: agents.rows[0].active, pending: agents.rows[0].pending, blocked: blocked.rows[0].n, inactive: inactive.rows[0].n },
    inactiveList: inactiveList.rows,
    accessRequests: access.rows[0].n,
    onLeave: onLeave.rows[0].n,
    recent: recent.rows,
  });
}
