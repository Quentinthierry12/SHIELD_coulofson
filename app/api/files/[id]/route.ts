import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readFileToken } from "@/lib/session";
import { DOC_TYPES } from "@/lib/onlyoffice";
import { redactDocx } from "@/lib/redact";

// Fetched server-to-server by OnlyOffice — auth is the signed URL token, not a cookie.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const token = new URL(req.url).searchParams.get("t") || "";
  const tok = await readFileToken(token);
  if (!id || !tok || tok.doc !== id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const pool = await db();
  const { rows } = await pool.query("SELECT filetype, content FROM documents WHERE id = $1", [id]);
  if (!rows[0]) return NextResponse.json({ error: "introuvable" }, { status: 404 });
  // Redacted (read-only) viewers get a filtered .docx; editors get the untouched original.
  let content: Buffer = rows[0].content;
  if (tok.red && rows[0].filetype === "docx") {
    content = await redactDocx(content, tok.clr);
  }
  return new NextResponse(new Uint8Array(content), {
    headers: { "Content-Type": DOC_TYPES[rows[0].filetype].mime },
  });
}
