import { NextResponse } from "next/server";
import { db, audit } from "@/lib/db";
import { createSession } from "@/lib/session";
import { exchangeCode, verifyState, sendDM } from "@/lib/discord";
import { ensurePersonnelOnboarding } from "@/lib/onboarding";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = await verifyState(url.searchParams.get("state") || "");
  const home = process.env.PORTAL_URL!;
  if (!code || !state) return NextResponse.redirect(`${home}/?discord=error`);

  const discordUser = await exchangeCode(code);
  if (!discordUser) return NextResponse.redirect(`${home}/?discord=error`);
  const pool = await db();

  if (state.mode === "link" && state.userId) {
    try {
      await pool.query("UPDATE users SET discord_id = $2 WHERE id = $1", [state.userId, discordUser.id]);
    } catch {
      return NextResponse.redirect(`${home}/dashboard?discord=taken`);
    }
    audit({ id: state.userId, matricule: "?" }, "discord_link", discordUser.username);
    sendDM(
      discordUser.id,
      "🦅 **TRANSMISSION S.H.I.E.L.D.** — Ce compte Discord est désormais lié à vos identifiants d'agent. Vous pourrez vous connecter avec Discord."
    ).catch(() => {});
    return NextResponse.redirect(`${home}/dashboard?discord=linked`);
  }

  // login flow
  const { rows } = await pool.query("SELECT * FROM users WHERE discord_id = $1", [discordUser.id]);
  const user = rows[0];
  if (!user) return NextResponse.redirect(`${home}/?discord=unknown`);
  if (user.status !== "active") return NextResponse.redirect(`${home}/?discord=inactive`);
  await createSession({
    id: user.id,
    matricule: user.matricule,
    codename: user.codename,
    clearance: user.clearance,
    role: user.role,
  });
  audit(user, "discord_login", discordUser.username);
  await ensurePersonnelOnboarding({
    id: user.id, matricule: user.matricule, codename: user.codename,
    clearance: user.clearance, role: user.role,
  });
  return NextResponse.redirect(`${home}/dashboard`);
}
