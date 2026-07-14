import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { buildMissionOrder } from "@/lib/docxgen";
import { dmByUserId } from "@/lib/discord";

export async function POST(req: Request) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Officers only." }, { status: 403 });
  const { code, objective, matricule, location, priority, classification, briefing, folder_id } = await req.json();
  if (!code?.trim() || !objective?.trim()) {
    return NextResponse.json({ error: "Mission code and objective are required." }, { status: 400 });
  }
  const level = Math.min(Math.max(1, classification || 1), s.clearance);
  const pool = await db();

  // Resolve the assigned agent (optional) to name it in the order and share it.
  let assigned: { id: number; codename: string; matricule: string } | null = null;
  if (matricule?.trim()) {
    const { rows } = await pool.query("SELECT id, codename, matricule FROM users WHERE matricule = $1 AND status = 'active'", [
      matricule.trim().toUpperCase(),
    ]);
    if (!rows[0]) return NextResponse.json({ error: "Assigned agent not found or inactive." }, { status: 404 });
    assigned = rows[0];
  }

  const content = await buildMissionOrder({
    code: code.trim(),
    objective: objective.trim(),
    agent: assigned ? `${assigned.matricule} · ${assigned.codename}` : "",
    location, priority, classification: level, briefing,
    officer: `${s.matricule} · ${s.codename}`,
  });

  const { rows } = await pool.query(
    `INSERT INTO documents (title, filetype, classification, owner_id, content, folder_id)
     VALUES ($1, 'docx', $2, $3, $4, $5) RETURNING id`,
    [`MISSION ORDER — ${code.trim().toUpperCase()}`, level, s.id, content, folder_id || null]
  );
  const docId = rows[0].id;

  if (assigned) {
    await pool.query("INSERT INTO document_shares (doc_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [docId, assigned.id]);
    dmByUserId(
      assigned.id,
      `🦅 **S.H.I.E.L.D. MISSION ORDER** — You are assigned to **${code.trim().toUpperCase()}**. Objective: ${objective.trim()}. Full order: ${process.env.PORTAL_URL}/doc/${docId}`
    );
  }
  audit(s, "mission_order", `#${docId} ${code.trim().toUpperCase()}${assigned ? " -> " + assigned.matricule : ""}`);
  return NextResponse.json({ id: docId });
}
