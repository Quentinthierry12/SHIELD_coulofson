import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, createPersonnelFile } from "@/lib/db";

const MATRICULE_RE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;

export async function POST(req: Request) {
  const { codename, password, matricule } = await req.json();
  if (!codename?.trim() || !password || password.length < 6) {
    return NextResponse.json({ error: "Codename required and password must be at least 6 characters." }, { status: 400 });
  }
  const custom = (matricule || "").trim().toUpperCase();
  if (custom && !MATRICULE_RE.test(custom)) {
    return NextResponse.json({ error: "Badge number: 3-20 characters, letters/digits/dashes only." }, { status: 400 });
  }
  const pool = await db();
  const hash = await bcrypt.hash(password, 10);
  // ponytail: retry loop on random matricule collision, unique index catches it
  for (let i = 0; i < 5; i++) {
    const m = custom || "AG-" + Math.floor(1000 + Math.random() * 9000);
    try {
      const { rows } = await pool.query(
        "INSERT INTO users (matricule, codename, password_hash) VALUES ($1, $2, $3) RETURNING id",
        [m, codename.trim(), hash]
      );
      await createPersonnelFile(rows[0].id, m, codename.trim());
      return NextResponse.json({ matricule: m });
    } catch (e: any) {
      if (e.code !== "23505") throw e;
      if (custom) return NextResponse.json({ error: "This badge number is already taken." }, { status: 409 });
    }
  }
  return NextResponse.json({ error: "Please try again." }, { status: 500 });
}
