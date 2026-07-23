import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

// Lightweight identity endpoint. Used by the desktop-portal bridge to feed the OnlyOffice
// Desktop Editors "portal:login" handshake, and handy anywhere the client needs to know who
// the current agent is. Returns 401 (not an error object) when there is no session, so the
// bridge can tell "signed out" apart from "signed in".
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({
    id: s.id,
    matricule: s.matricule,
    codename: s.codename,
    role: s.role,
    clearance: s.clearance,
  });
}
