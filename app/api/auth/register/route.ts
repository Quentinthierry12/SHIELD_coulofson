import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const { codename, password } = await req.json();
  if (!codename?.trim() || !password || password.length < 6) {
    return NextResponse.json({ error: "Nom de code requis et mot de passe de 6 caractères minimum." }, { status: 400 });
  }
  const pool = await db();
  const hash = await bcrypt.hash(password, 10);
  // ponytail: retry loop on random matricule collision, unique index catches it
  for (let i = 0; i < 5; i++) {
    const matricule = "AG-" + Math.floor(1000 + Math.random() * 9000);
    try {
      await pool.query(
        "INSERT INTO users (matricule, codename, password_hash) VALUES ($1, $2, $3)",
        [matricule, codename.trim(), hash]
      );
      return NextResponse.json({ matricule });
    } catch (e: any) {
      if (e.code !== "23505") throw e;
    }
  }
  return NextResponse.json({ error: "Réessayez." }, { status: 500 });
}
