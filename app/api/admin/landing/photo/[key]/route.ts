import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";

// Upload / remove a landing-page photo (officer only). Stored in Postgres so it survives
// redeploys of the ephemeral container. key = 'hero', 'about', or 'div:<divisionId>'.
const KEY_RE = /^(hero|about|div:\d+)$/;
const MAX = 4 * 1024 * 1024; // landing photos are hero-sized; 4 MB is plenty

export async function POST(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const { key } = await params;
  if (!KEY_RE.test(key)) return NextResponse.json({ error: "Unknown photo slot." }, { status: 400 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No image received." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Image too large (4 MB max)." }, { status: 400 });
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    return NextResponse.json({ error: "PNG, JPEG or WebP only." }, { status: 400 });
  }

  const pool = await db();
  await pool.query(
    `INSERT INTO landing_photos (key, mime, data, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = now()`,
    [key, file.type, Buffer.from(await file.arrayBuffer())]
  );
  audit(s, "settings_update", `landing photo ${key} set`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const { key } = await params;
  if (!KEY_RE.test(key)) return NextResponse.json({ error: "Unknown photo slot." }, { status: 400 });
  const pool = await db();
  await pool.query("DELETE FROM landing_photos WHERE key = $1", [key]);
  audit(s, "settings_update", `landing photo ${key} removed`);
  return NextResponse.json({ ok: true });
}
