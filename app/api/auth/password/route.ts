import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { current, next } = await req.json();
  if (!next || next.length < 6) return NextResponse.json({ error: "Nouveau mot de passe : 6 caractères minimum." }, { status: 400 });
  const pool = await db();
  const { rows } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [s.id]);
  if (!(await bcrypt.compare(current || "", rows[0].password_hash))) {
    return NextResponse.json({ error: "Mot de passe actuel incorrect." }, { status: 403 });
  }
  await pool.query("UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1", [
    s.id,
    await bcrypt.hash(next, 10),
  ]);
  return NextResponse.json({ ok: true });
}
