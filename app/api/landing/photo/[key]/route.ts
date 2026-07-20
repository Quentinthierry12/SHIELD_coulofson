import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUBLIC landing-page photo. No auth: the landing page is public and these images carry no
// classified content. Keys are whitelisted so this can never read an arbitrary row.
// The landing page appends ?v=<updated_at> for cache-busting, so we can cache hard.
const KEY_RE = /^(hero|about|div:\d+)$/;

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!KEY_RE.test(key)) return new NextResponse(null, { status: 404 });
  const pool = await db();
  const { rows } = await pool.query("SELECT mime, data FROM landing_photos WHERE key = $1", [key]);
  const row = rows[0];
  if (!row?.data) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime || "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
