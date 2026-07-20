import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, createPersonnelFile, audit, getSetting } from "@/lib/db";
import { syncMoodleUser } from "@/lib/moodle";
import { discordEnabled, signPendingLinkToken } from "@/lib/discord";

const MATRICULE_RE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;

export async function POST(req: Request) {
  if ((await getSetting("public_registration")) === "off") {
    return NextResponse.json({ error: "Public enlistment is currently closed. Contact an officer." }, { status: 403 });
  }
  const { codename, password, matricule } = await req.json();
  if (!codename?.trim() || !password || password.length < 6) {
    return NextResponse.json({ error: "Code name required and password of at least 6 characters." }, { status: 400 });
  }
  const custom = (matricule || "").trim().toUpperCase();
  if (custom && !MATRICULE_RE.test(custom)) {
    return NextResponse.json({ error: "Badge number: 3 to 20 characters, letters/digits/dashes only." }, { status: 400 });
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
      // Provision the Academy account now (password available), suspended until validated.
      await syncMoodleUser(rows[0].id, { matricule: m, codename: codename.trim(), suspended: true }, password);
      audit({ id: rows[0].id, matricule: m }, "register", codename.trim());
      // Jeton pour lier Discord tout de suite (recevoir les DM de suivi avant validation).
      const linkToken = discordEnabled() ? await signPendingLinkToken(rows[0].id) : null;
      return NextResponse.json({ matricule: m, discord: discordEnabled(), linkToken });
    } catch (e: any) {
      if (e.code !== "23505") throw e;
      if (custom) return NextResponse.json({ error: "This badge number is already taken." }, { status: 409 });
    }
  }
  return NextResponse.json({ error: "Please try again." }, { status: 500 });
}
