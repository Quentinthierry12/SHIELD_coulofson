import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

// Current state of the editable landing photos, for Command → Settings.
// Returns a cache-busting version (updated_at epoch) per slot, plus every division so the
// officer can set a photo for each. No image bytes here — previews load from the public route.
export async function GET() {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const pool = await db();
  const { rows: photos } = await pool.query(
    "SELECT key, EXTRACT(EPOCH FROM updated_at)::bigint AS v FROM landing_photos"
  );
  const byKey = new Map<string, number>(photos.map((p: { key: string; v: string }) => [p.key, Number(p.v)]));
  const { rows: divisions } = await pool.query("SELECT id, name FROM divisions ORDER BY name");
  return NextResponse.json({
    hero: byKey.get("hero") ?? null,
    about: byKey.get("about") ?? null,
    divisions: divisions.map((d: { id: number; name: string }) => ({
      id: d.id,
      name: d.name,
      v: byKey.get(`div:${d.id}`) ?? null,
    })),
  });
}
