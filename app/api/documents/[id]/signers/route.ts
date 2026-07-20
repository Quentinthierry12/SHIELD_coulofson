import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { extractSignMarkers } from "@/lib/sigmarkers";

// Which signature slots does this document declare? Placing [[SIGN:AG-4782]] in the text
// is how the author says who must sign — the request form reads them so nobody retypes
// badges that are already written in the document.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const pool = await db();
  const { rows } = await pool.query("SELECT content, filetype, owner_id FROM documents WHERE id = $1", [id]);
  if (!rows[0]) return NextResponse.json({ error: "Document inconnu." }, { status: 404 });
  if (s.role !== "admin" && rows[0].owner_id !== s.id) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }
  if (rows[0].filetype !== "docx") return NextResponse.json({ slots: [], agents: [] });

  const markers = await extractSignMarkers(rows[0].content);
  // Resolve badge tokens to real agents; role tokens and bare [[SIGN]] are reported as-is
  // so the officer can see the document expects a signer it cannot name by itself.
  const agents: { matricule: string; codename: string; clearance: number }[] = [];
  const unresolved: string[] = [];
  for (const m of markers) {
    if (!m.token) { unresolved.push("any signer"); continue; }
    if (m.token === "OFFICER" || m.token === "AGENT") { unresolved.push(m.token.toLowerCase()); continue; }
    const { rows: u } = await pool.query(
      "SELECT matricule, codename, clearance FROM users WHERE matricule = $1 AND status = 'active'", [m.token]
    );
    if (u[0]) {
      if (!agents.some((a) => a.matricule === u[0].matricule)) agents.push(u[0]);
    } else {
      unresolved.push(m.token); // named badge that does not exist — say so, don't swallow it
    }
  }
  return NextResponse.json({ slots: markers.length, agents, unresolved });
}
