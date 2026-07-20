import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { getSession } from "@/lib/session";

const MAX = 512 * 1024; // a scanned signature is small; refuse anything that is not

// The agent's reusable handwritten signature: uploaded once, applied to any document.
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const pool = await db();
  const { rows } = await pool.query("SELECT signature_image FROM users WHERE id = $1", [s.id]);
  const img: Buffer | null = rows[0]?.signature_image ?? null;
  if (!img) return NextResponse.json({ error: "No signature saved." }, { status: 404 });
  return new NextResponse(new Uint8Array(img), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" },
  });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No image received." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Image too large (512 KB max)." }, { status: 400 });
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
    return NextResponse.json({ error: "PNG, JPEG or WebP only." }, { status: 400 });
  }
  const pool = await db();
  await pool.query("UPDATE users SET signature_image = $2 WHERE id = $1", [s.id, Buffer.from(await file.arrayBuffer())]);
  audit(s, "signature_upload", "handwritten signature stored");
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const pool = await db();
  await pool.query("UPDATE users SET signature_image = NULL WHERE id = $1", [s.id]);
  audit(s, "signature_upload", "handwritten signature removed");
  return NextResponse.json({ ok: true });
}
