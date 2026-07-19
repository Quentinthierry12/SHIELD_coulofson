import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DOC_TYPES } from "@/lib/onlyoffice";
import { redactDocx } from "@/lib/redact";

// Served to the OnlyOffice server for public documents. Auth = the unguessable
// public token in the URL. Classified sections are redacted (clearance 0).
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const pool = await db();
  const { rows } = await pool.query("SELECT filetype, content FROM documents WHERE public_token = $1", [token]);
  if (!rows[0]) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  let content: Buffer = rows[0].content;
  if (rows[0].filetype === "docx") content = await redactDocx(content, 0);
  return new NextResponse(new Uint8Array(content), {
    headers: { "Content-Type": DOC_TYPES[rows[0].filetype].mime },
  });
}
