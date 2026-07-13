import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";
import { DOC_TYPES } from "@/lib/onlyoffice";
import { promptableVariables } from "@/lib/docxgen";

const MAX_SIZE = 25 * 1024 * 1024;

export async function GET() {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Officers only." }, { status: 403 });
  const pool = await db();
  const { rows } = await pool.query("SELECT id, name, filetype, body, created_at FROM templates ORDER BY name");
  return NextResponse.json(
    rows.map((r: any) => ({
      id: r.id, name: r.name, filetype: r.filetype, created_at: r.created_at,
      editable: r.body != null,
      variables: r.body ? promptableVariables(r.body) : [],
    }))
  );
}

// Create a template: either an uploaded file (multipart) or an on-site text template (JSON {name, body}).
export async function POST(req: Request) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Officers only." }, { status: 403 });
  const pool = await db();

  if (req.headers.get("content-type")?.includes("application/json")) {
    const { name, body } = await req.json();
    if (!name?.trim() || !body?.trim()) return NextResponse.json({ error: "Name and content are required." }, { status: 400 });
    await pool.query(
      "INSERT INTO templates (name, filetype, content, body, created_by) VALUES ($1, 'docx', ''::bytea, $2, $3)",
      [name.trim(), body, s.id]
    );
    audit(s, "template_create", name.trim());
    return NextResponse.json({ ok: true });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const name = String(form.get("name") || "").trim();
  if (!file) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (25 MB max)." }, { status: 400 });
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!DOC_TYPES[ext]) return NextResponse.json({ error: "Unsupported format: .docx, .xlsx or .pptx only." }, { status: 400 });
  const content = Buffer.from(await file.arrayBuffer());
  await pool.query("INSERT INTO templates (name, filetype, content, created_by) VALUES ($1, $2, $3, $4)", [
    name || file.name.replace(/\.[^.]+$/, ""),
    ext,
    content,
    s.id,
  ]);
  audit(s, "template_upload", name || file.name);
  return NextResponse.json({ ok: true });
}
