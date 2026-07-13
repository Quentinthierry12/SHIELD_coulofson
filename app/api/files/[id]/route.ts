import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyFileToken } from "@/lib/session";
import { DOC_TYPES } from "@/lib/onlyoffice";

// Fetched server-to-server by OnlyOffice — auth is the signed URL token, not a cookie.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  const token = new URL(req.url).searchParams.get("t") || "";
  if (!id || !(await verifyFileToken(token, id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const pool = await db();
  const { rows } = await pool.query("SELECT filetype, content FROM documents WHERE id = $1", [id]);
  if (!rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(rows[0].content, {
    headers: { "Content-Type": DOC_TYPES[rows[0].filetype].mime },
  });
}
