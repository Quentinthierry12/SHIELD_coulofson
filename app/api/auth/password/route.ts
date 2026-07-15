import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, audit } from "@/lib/db";
import { getSession, createSession } from "@/lib/session";
import { setMoodlePassword } from "@/lib/moodle";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { current, next } = await req.json();
  if (!next || next.length < 6) return NextResponse.json({ error: "New password: at least 6 characters." }, { status: 400 });
  const pool = await db();
  const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [s.id]);
  if (!(await bcrypt.compare(current || "", rows[0].password_hash))) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
  }
  await pool.query("UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1", [
    s.id,
    await bcrypt.hash(next, 10),
  ]);
  await setMoodlePassword(s.id, next); // keep Academy password in sync
  // Refresh the session so the "must change password" gate clears immediately.
  await createSession({ ...s, mustChangePassword: false });
  audit(s, "password_change");
  return NextResponse.json({ ok: true });
}
