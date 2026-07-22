import { NextResponse } from "next/server";
import { dmPrefix } from "@/lib/brand";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dmByUserId } from "@/lib/discord";
import { folderRole, atLeast, normalizeRole, type Role } from "@/lib/permissions";

// Gérer les invitations d'un dossier exige le rôle Gestionnaire (créateur, officier, ou
// partage Gestionnaire hérité).
async function canManage(folderId: number) {
  const s = await getSession();
  if (!s) return null;
  return atLeast(await folderRole(folderId, s), "manager") ? s : null;
}

const ROLE_FR: Record<Role, string> = { viewer: "view", editor: "edit", manager: "manage" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  if (!(await canManage(id))) return NextResponse.json({ error: "Manager role required for this folder." }, { status: 403 });
  const pool = await db();
  const { rows: users } = await pool.query(
    `SELECT 'user' AS kind, u.matricule, u.codename, u.clearance, fm.role
       FROM folder_members fm JOIN users u ON u.id = fm.user_id
     WHERE fm.folder_id = $1 ORDER BY u.codename`,
    [id]
  );
  const { rows: divs } = await pool.query(
    `SELECT 'division' AS kind, d.id AS division_id, d.name,
            (SELECT COUNT(*) FROM users u WHERE u.division_id = d.id AND u.status = 'active')::int AS members,
            fdm.role
       FROM folder_division_members fdm JOIN divisions d ON d.id = fdm.division_id
      WHERE fdm.folder_id = $1 ORDER BY d.name`,
    [id]
  );
  return NextResponse.json([...divs, ...users]);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const s = await canManage(id);
  if (!s) return NextResponse.json({ error: "Manager role required for this folder." }, { status: 403 });
  const body = await req.json();
  const r = normalizeRole(body.role);
  const pool = await db();
  const { rows: f } = await pool.query("SELECT name FROM folders WHERE id = $1", [id]);
  const folderName = f[0]?.name || "?";

  // Grant a whole division access to the folder.
  if (body.division_id) {
    const { rows: dv } = await pool.query("SELECT id, name FROM divisions WHERE id = $1", [body.division_id]);
    if (!dv[0]) return NextResponse.json({ error: "Unknown division." }, { status: 404 });
    await pool.query(
      "INSERT INTO folder_division_members (folder_id, division_id, role) VALUES ($1, $2, $3) ON CONFLICT (folder_id, division_id) DO UPDATE SET role = EXCLUDED.role",
      [id, dv[0].id, r]
    );
    audit(s, "folder_invite", `${folderName} -> division ${dv[0].name} (${r})`);
    const { rows: mem } = await pool.query("SELECT id FROM users WHERE division_id = $1 AND status = 'active'", [dv[0].id]);
    for (const m of mem) {
      dmByUserId(
        m.id,
        `${dmPrefix()} — Your division **${dv[0].name}** was granted access (**${ROLE_FR[r]}**) to the restricted folder **${folderName}**. ${process.env.PORTAL_URL}/dashboard`
      );
    }
    return NextResponse.json({ ok: true, name: dv[0].name, role: r, kind: "division" });
  }

  // Grant a single agent.
  const badge = (body.matricule || "").trim().toUpperCase();
  const { rows } = await pool.query("SELECT id, codename FROM users WHERE matricule = $1 AND status = 'active'", [badge]);
  if (!rows[0]) return NextResponse.json({ error: "Unknown badge or inactive agent." }, { status: 404 });
  await pool.query(
    "INSERT INTO folder_members (folder_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (folder_id, user_id) DO UPDATE SET role = EXCLUDED.role",
    [id, rows[0].id, r]
  );
  audit(s, "folder_invite", `${folderName} -> ${badge} (${r})`);
  dmByUserId(
    rows[0].id,
    `${dmPrefix()} — You were granted access (**${ROLE_FR[r]}**) to the restricted folder **${folderName}**. ${process.env.PORTAL_URL}/dashboard`
  );
  return NextResponse.json({ ok: true, codename: rows[0].codename, role: r, kind: "user" });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const s = await canManage(id);
  if (!s) return NextResponse.json({ error: "Manager role required for this folder." }, { status: 403 });
  const body = await req.json();
  const pool = await db();
  if (body.division_id) {
    await pool.query("DELETE FROM folder_division_members WHERE folder_id = $1 AND division_id = $2", [id, body.division_id]);
    audit(s, "folder_uninvite", `${id} -> division ${body.division_id}`);
    return NextResponse.json({ ok: true });
  }
  const badge = (body.matricule || "").trim().toUpperCase();
  await pool.query(
    "DELETE FROM folder_members WHERE folder_id = $1 AND user_id = (SELECT id FROM users WHERE matricule = $2)",
    [id, badge]
  );
  audit(s, "folder_uninvite", `${id} -> ${badge}`);
  return NextResponse.json({ ok: true });
}
