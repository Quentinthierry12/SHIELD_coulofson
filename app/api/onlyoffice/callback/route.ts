import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { readFileToken } from "@/lib/session";
import { verifyOOToken } from "@/lib/onlyoffice";

// OnlyOffice pushes save events here. status 2 = document ready for saving,
// status 6 = force save. Anything else just needs {error: 0}.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const id = parseInt(url.searchParams.get("id") || "", 10);
  const t = url.searchParams.get("t") || "";
  const tok = await readFileToken(t);
  // Only tokens minted with edit rights (owner / invited / officer) may save. A redacted
  // view or a clearance-only viewer is read-only and can never overwrite the real doc.
  if (!id || !tok || tok.doc !== id || tok.red || !tok.edit) {
    return NextResponse.json({ error: 1 });
  }
  const body = await req.json();
  // The DS signs its callbacks: verify to reject forged saves.
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer /, "");
  const signed = body.token ? await verifyOOToken(body.token) : auth ? await verifyOOToken(auth) : null;
  if (!signed) return NextResponse.json({ error: 1 });
  const data = signed.payload ?? signed;

  if ((data.status === 2 || data.status === 6) && data.url) {
    const res = await fetch(data.url);
    if (!res.ok) return NextResponse.json({ error: 1 });
    const content = Buffer.from(await res.arrayBuffer());
    const pool = await db();
    await pool.query(
      "UPDATE documents SET content = $2, version = version + 1, updated_at = now() WHERE id = $1",
      [id, content]
    );
    const editorId = parseInt(data.users?.[0], 10);
    const { rows: u } = editorId
      ? await pool.query("SELECT id, matricule FROM users WHERE id = $1", [editorId])
      : { rows: [] as any[] };
    audit(u[0] || null, "doc_save", `#${id}`);
  }
  return NextResponse.json({ error: 0 });
}
