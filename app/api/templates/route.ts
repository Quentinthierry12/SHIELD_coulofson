import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";
import { promptableVariables } from "@/lib/docxgen";

// Template library, readable by any signed-in agent (browse & reuse). Creating, editing and
// deleting templates stays officer-only (see /api/admin/templates).
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
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
