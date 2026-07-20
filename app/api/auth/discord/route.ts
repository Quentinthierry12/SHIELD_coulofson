import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { discordAuthUrl, discordEnabled, readPendingLinkToken } from "@/lib/discord";

export async function GET(req: Request) {
  if (!discordEnabled()) {
    return NextResponse.json({ error: "The Discord integration is not configured yet." }, { status: 503 });
  }
  // Recrue en attente qui vient de s'enrôler : jeton de liaison (pas de session encore).
  const link = new URL(req.url).searchParams.get("link");
  if (link) {
    const uid = await readPendingLinkToken(link);
    if (uid) return NextResponse.redirect(await discordAuthUrl("link", uid, true));
  }
  const s = await getSession();
  // Logged in → link flow ; anonymous → login flow
  const url = s ? await discordAuthUrl("link", s.id) : await discordAuthUrl("login");
  return NextResponse.redirect(url);
}
