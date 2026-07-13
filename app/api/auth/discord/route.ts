import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { discordAuthUrl, discordEnabled } from "@/lib/discord";

export async function GET() {
  if (!discordEnabled()) {
    return NextResponse.json({ error: "Discord integration is not configured yet." }, { status: 503 });
  }
  const s = await getSession();
  // Logged in → link flow ; anonymous → login flow
  const url = s ? await discordAuthUrl("link", s.id) : await discordAuthUrl("login");
  return NextResponse.redirect(url);
}
