import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { DOC_TYPES } from "@/lib/onlyoffice";

const MAX_SIZE = 25 * 1024 * 1024;

export async function GET() {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Officers only." }, { status: 403 });
  const pool = await db();
  const { rows } = await pool.query("SELECT id, name, filetype, created_at FROM templates ORDER BY name");
  return NextResponse.json(rows);
}

// Upload a new template file (.docx/.xlsx/.pptx).
export async function POST(req: Request) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Officers only." }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const name = String(form.get("name") || "").trim();
  if (!file) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (25 MB max)." }, { status: 400 });
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!DOC_TYPES[ext]) return NextResponse.json({ error: "Unsupported format: .docx, .xlsx or .pptx only." }, { status: 400 });
  const content = Buffer.from(await file.arrayBuffer());
  const pool = await db();
  await pool.query("INSERT INTO templates (name, filetype, content, created_by) VALUES ($1, $2, $3, $4)", [
    name || file.name.replace(/\.[^.]+$/, ""),
    ext,
    content,
    s.id,
  ]);
  audit(s, "template_upload", name || file.name);
  return NextResponse.json({ ok: true });
}
