import { NextResponse } from "next/server";
import { db, getSetting, setSetting, audit } from "@/lib/db";
import { getSession } from "@/lib/session";

// Keys the officers may configure from Command.
const KEYS = ["personnel_folder_id", "onboarding_enabled", "public_registration"];

export async function GET() {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const out: Record<string, string | null> = {};
  for (const k of KEYS) out[k] = await getSetting(k);
  // Provide the folder list too so the UI can offer a dropdown.
  const pool = await db();
  const { rows } = await pool.query("SELECT id, name FROM folders ORDER BY name");
  return NextResponse.json({ settings: out, folders: rows });
}

export async function POST(req: Request) {
  const s = await getSession();
  if (s?.role !== "admin") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const body = await req.json();
  for (const k of KEYS) {
    if (k in body) await setSetting(k, String(body[k] ?? ""));
  }
  audit(s, "settings_update", Object.keys(body).filter((k) => KEYS.includes(k)).join(", "));
  return NextResponse.json({ ok: true });
}
