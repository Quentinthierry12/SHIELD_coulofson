import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";

const STATUSES = ["active", "completed", "aborted"];

// Close a mission, reopen it, or file the after-action report. Officers can do all of it;
// an assigned agent may file the report and mark the mission completed — they are the one
// who was there. Only an officer can abort or reopen.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const { status, report } = await req.json();
  const pool = await db();

  const { rows } = await pool.query("SELECT * FROM missions WHERE id = $1", [id]);
  const m = rows[0];
  if (!m) return NextResponse.json({ error: "Mission inconnue." }, { status: 404 });

  const { rowCount: assigned } = await pool.query(
    "SELECT 1 FROM mission_agents WHERE mission_id = $1 AND user_id = $2", [id, s.id]
  );
  const officer = s.role === "admin";
  if (!officer && !assigned) return NextResponse.json({ error: "Vous n'êtes pas affecté à cette mission." }, { status: 403 });

  if (report !== undefined) {
    await pool.query("UPDATE missions SET report = $2 WHERE id = $1", [id, String(report).trim() || null]);
    audit(s, "mission_report", `${m.code}`);
  }

  if (status !== undefined) {
    if (!STATUSES.includes(status)) return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    if (!officer && status !== "completed") {
      return NextResponse.json({ error: "Seul un officier peut annuler ou rouvrir une mission." }, { status: 403 });
    }
    await pool.query(
      "UPDATE missions SET status = $2, closed_at = CASE WHEN $2 = 'active' THEN NULL ELSE now() END WHERE id = $1",
      [id, status]
    );
    audit(s, "mission_status", `${m.code} -> ${status}`);
    if (status !== "active" && status !== m.status) {
      // Tell the team it is over — otherwise agents keep an order open that no longer stands.
      const { rows: team } = await pool.query("SELECT user_id FROM mission_agents WHERE mission_id = $1", [id]);
      const verb = status === "completed" ? "**terminée**" : "**annulée**";
      for (const t of team) {
        dmByUserId(t.user_id, `🦅 **TRANSMISSION S.H.I.E.L.D.** — La mission **${m.code}** est ${verb}. Repos.`);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Réservé aux officiers." }, { status: 403 });
  const id = parseInt((await params).id, 10);
  const pool = await db();
  const { rows } = await pool.query("DELETE FROM missions WHERE id = $1 RETURNING code, doc_id", [id]);
  if (!rows[0]) return NextResponse.json({ error: "Mission inconnue." }, { status: 404 });
  await pool.query("DELETE FROM mission_agents WHERE mission_id = $1", [id]);
  // The order document is deliberately kept: it is the archive of what was ordered.
  audit(s, "mission_delete", `${rows[0].code}`);
  return NextResponse.json({ ok: true });
}
