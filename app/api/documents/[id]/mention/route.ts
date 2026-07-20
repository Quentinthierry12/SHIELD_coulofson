import { NextResponse } from "next/server";
import { db, getAccessibleDoc, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";

// Called by the editor when an agent is @mentioned in a comment. Pings each mentioned agent
// on every channel (push + Discord DM). `emails` carries the badges we handed the editor.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = parseInt((await params).id, 10);
  const doc = await getAccessibleDoc(id, s.clearance, s.id, s.role);
  if (!doc) return NextResponse.json({ error: "Access denied." }, { status: 403 });

  const { emails, comment } = await req.json().catch(() => ({}));
  const badges = (Array.isArray(emails) ? emails : [])
    .map((e: unknown) => String(e).trim().toUpperCase())
    .filter(Boolean);
  if (!badges.length) return NextResponse.json({ ok: true, notified: 0 });

  const pool = await db();
  const { rows } = await pool.query(
    "SELECT id FROM users WHERE matricule = ANY($1) AND status = 'active' AND id <> $2",
    [badges, s.id]
  );
  const snippet = String(comment || "").replace(/\s+/g, " ").trim().slice(0, 140);
  for (const u of rows as { id: number }[]) {
    dmByUserId(
      u.id,
      `🦅 **S.H.I.E.L.D.** — Agent **${s.codename}** mentioned you in **“${doc.title}”**${snippet ? `: ${snippet}` : ""}. ${process.env.PORTAL_URL}/doc/${id}`,
      {
        title: "S.H.I.E.L.D. — Mention",
        body: `${s.codename} mentioned you in “${doc.title}”`,
        url: `/doc/${id}`,
        tag: `mention-${id}`,
      }
    );
  }
  audit(s, "doc_mention", `#${id} ${doc.title} -> ${badges.join(", ")}`);
  return NextResponse.json({ ok: true, notified: rows.length });
}
