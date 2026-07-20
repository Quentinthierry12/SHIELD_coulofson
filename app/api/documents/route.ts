import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { db, accessibleFolderIds, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { DOC_TYPES } from "@/lib/onlyoffice";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const pool = await db();
  const folderIds = await accessibleFolderIds(s.id, s.role);
  // Everything is listed; what the agent may not open comes back flagged `locked`
  // (by clearance or by private folder) so they can request access.
  // Mirrors getAccessibleDoc: an explicit grant (owner / officer / share) wins over
  // both barriers; otherwise clearance AND folder must both pass.
  const { rows } = await pool.query(
    `SELECT d.id, d.title, d.filetype, d.classification, d.folder_id, d.updated_at, u.codename AS owner,
            (d.owner_id = $2) AS mine,
            (d.owner_id = $2 OR $3 = 'admin'
              OR EXISTS (SELECT 1 FROM document_shares s WHERE s.doc_id = d.id AND s.user_id = $2)
              OR EXISTS (SELECT 1 FROM document_division_shares dds JOIN users mu ON mu.id = $2
                          WHERE dds.doc_id = d.id AND dds.division_id = mu.division_id)) AS granted,
            (d.classification <= $1) AS clearance_ok,
            (d.folder_id IS NULL OR d.folder_id = ANY($4)) AS folder_ok,
            d.locked AS sealed,
            (SELECT ar.status FROM access_requests ar WHERE ar.doc_id = d.id AND ar.user_id = $2) AS request_status
     FROM documents d LEFT JOIN users u ON u.id = d.owner_id
     ORDER BY d.updated_at DESC`,
    [s.clearance, s.id, s.role, folderIds]
  );
  return NextResponse.json(
    rows.map((r: any) => {
      const locked = !(r.granted || (r.clearance_ok && r.folder_ok));
      return {
        id: r.id, title: r.title, filetype: r.filetype, classification: r.classification,
        folder_id: r.folder_id, updated_at: r.updated_at, owner: r.owner, mine: r.mine,
        sealed: r.sealed,
        locked,
        lock_reason: locked ? (!r.clearance_ok ? "clearance" : "folder") : null,
        request_status: r.request_status || null,
      };
    })
  );
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { title, filetype, classification, folder_id } = await req.json();
  if (!title?.trim() || !DOC_TYPES[filetype]) {
    return NextResponse.json({ error: "Le titre et le type sont requis." }, { status: 400 });
  }
  const level = Math.min(Math.max(1, classification || 1), s.clearance);
  const template = await readFile(path.join(process.cwd(), "templates", `new.${filetype}`));
  const pool = await db();
  const { rows } = await pool.query(
    `INSERT INTO documents (title, filetype, classification, owner_id, content, folder_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [title.trim(), filetype, level, s.id, template, folder_id || null]
  );
  audit(s, "doc_create", `#${rows[0].id} ${title.trim()} (${filetype}, lvl ${level})`);
  return NextResponse.json({ id: rows[0].id });
}
