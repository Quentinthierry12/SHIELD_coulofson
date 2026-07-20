import { NextResponse } from "next/server";
import { db, audit, divisionIdByName } from "@/lib/db";
import { getSession } from "@/lib/session";
import { buildMissionOrder } from "@/lib/docxgen";
import { dmByUserId } from "@/lib/discord";

// Missions are tracked objects, not just a generated document. The order stays a .docx
// (doc_id) so it can be read in the editor and exported to PDF; this table adds what a
// document cannot carry: status, assignees, and the after-action report.

// Officers see everything within their clearance; an agent sees the missions they are
// assigned to. Classification applies on top, exactly like documents.
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const pool = await db();
  const { rows } = await pool.query(
    `SELECT m.id, m.code, m.objective, m.location, m.priority, m.classification,
            m.status, m.doc_id, m.created_at, m.closed_at, m.report,
            COALESCE(dv.name, '') AS division,
            u.codename AS created_by_codename,
            COALESCE(
              (SELECT json_agg(json_build_object('id', a.id, 'matricule', a.matricule, 'codename', a.codename))
                 FROM mission_agents ma JOIN users a ON a.id = ma.user_id
                WHERE ma.mission_id = m.id), '[]'
            ) AS agents
       FROM missions m
       LEFT JOIN divisions dv ON dv.id = m.division_id
       LEFT JOIN users u ON u.id = m.created_by
      WHERE m.classification <= $1
        AND ($2 = 'admin' OR EXISTS (SELECT 1 FROM mission_agents ma WHERE ma.mission_id = m.id AND ma.user_id = $3))
      ORDER BY CASE m.status WHEN 'active' THEN 0 ELSE 1 END, m.created_at DESC`,
    [s.role === "admin" ? 10 : s.clearance, s.role, s.id]
  );
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Officers only." }, { status: 403 });
  const { code, objective, matricule, location, priority, classification, briefing, folder_id, division } =
    await req.json();
  if (!code?.trim() || !objective?.trim()) {
    return NextResponse.json({ error: "Le code de mission et l'objectif sont requis." }, { status: 400 });
  }
  const level = Math.min(Math.max(1, classification || 1), s.clearance);
  const missionCode = code.trim().toUpperCase();
  const pool = await db();

  // Assigned agents, by badge (comma / space / newline separated).
  const badges = String(matricule || "").split(/[\s,;]+/).map((b) => b.trim().toUpperCase()).filter(Boolean);
  const assigned: { id: number; codename: string; matricule: string }[] = [];
  for (const b of [...new Set(badges)]) {
    const { rows } = await pool.query(
      "SELECT id, codename, matricule FROM users WHERE matricule = $1 AND status = 'active'",
      [b]
    );
    if (!rows[0]) return NextResponse.json({ error: `Agent ${b} introuvable ou inactif.` }, { status: 404 });
    assigned.push(rows[0]);
  }

  const content = await buildMissionOrder({
    code: missionCode,
    objective: objective.trim(),
    agent: assigned.map((a) => `${a.matricule} · ${a.codename}`).join(", "),
    location, priority, classification: level, briefing,
    officer: `${s.matricule} · ${s.codename}`,
  });

  const { rows: doc } = await pool.query(
    `INSERT INTO documents (title, filetype, classification, owner_id, content, folder_id)
     VALUES ($1, 'docx', $2, $3, $4, $5) RETURNING id`,
    [`MISSION ORDER — ${missionCode}`, level, s.id, content, folder_id || null]
  );
  const docId = doc[0].id;

  let missionId: number;
  try {
    const { rows: m } = await pool.query(
      `INSERT INTO missions (code, objective, location, priority, classification, doc_id, division_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [missionCode, objective.trim(), location || null, priority || null, level, docId,
       await divisionIdByName(division), s.id]
    );
    missionId = m[0].id;
  } catch (e: any) {
    // The order document is already written; don't leave it orphaned behind a failed insert.
    if (e.code === "23505") {
      await pool.query("DELETE FROM documents WHERE id = $1", [docId]);
      return NextResponse.json({ error: `Mission ${missionCode} already exists.` }, { status: 409 });
    }
    throw e;
  }

  for (const a of assigned) {
    await pool.query("INSERT INTO mission_agents (mission_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [missionId, a.id]);
    // The order is classified: share it explicitly so an assigned agent below the
    // classification can still read their own orders.
    await pool.query("INSERT INTO document_shares (doc_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [docId, a.id]);
    dmByUserId(
      a.id,
      `🦅 **S.H.I.E.L.D. MISSION ORDER** — You are assigned to **${missionCode}**. Objective: ${objective.trim()}. Full order: ${process.env.PORTAL_URL}/doc/${docId}`
    );
  }
  audit(s, "mission_create", `${missionCode}${assigned.length ? " -> " + assigned.map((a) => a.matricule).join(",") : ""}`);
  return NextResponse.json({ id: missionId, doc_id: docId });
}
