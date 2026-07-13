import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, audit } from "@/lib/db";
import { createSession } from "@/lib/session";

export async function POST(req: Request) {
  const { matricule, password } = await req.json();
  const pool = await db();
  const { rows } = await pool.query("SELECT * FROM users WHERE matricule = $1", [
    (matricule || "").trim().toUpperCase(),
  ]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password || "", user.password_hash))) {
    audit(null, "login_failed", (matricule || "").trim().toUpperCase());
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }
  if (user.status === "pending") {
    return NextResponse.json({ error: "Account awaiting validation by a senior officer." }, { status: 403 });
  }
  if (user.status !== "active") {
    return NextResponse.json({ error: "Access revoked." }, { status: 403 });
  }
  await createSession({
    id: user.id,
    matricule: user.matricule,
    codename: user.codename,
    clearance: user.clearance,
    role: user.role,
    mustChangePassword: user.must_change_password,
  });
  audit(user, "login");
  return NextResponse.json({ ok: true, mustChangePassword: user.must_change_password });
}
