import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { DOC_TYPES } from "@/lib/onlyoffice";

const MAX_SIZE = 25 * 1024 * 1024; // 25 Mo

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const classification = Math.min(Math.max(1, parseInt(String(form.get("classification")), 10) || 1), s.clearance);
  const folderId = parseInt(String(form.get("folder_id")), 10) || null;
  if (!file) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (25 MB max)." }, { status: 400 });
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!DOC_TYPES[ext]) {
    return NextResponse.json({ error: "Unsupported format: .docx, .xlsx or .pptx only." }, { status: 400 });
  }
  const title = file.name.replace(/\.[^.]+$/, "");
  const content = Buffer.from(await file.arrayBuffer());
  const pool = await db();
  const { rows } = await pool.query(
    `INSERT INTO documents (title, filetype, classification, owner_id, content, folder_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [title, ext, classification, s.id, content, folderId]
  );
  audit(s, "doc_import", `#${rows[0].id} ${title} (${ext})`);
  return NextResponse.json({ id: rows[0].id });
}
