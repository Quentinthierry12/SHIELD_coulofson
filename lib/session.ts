import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secret = () => new TextEncoder().encode(process.env.APP_SECRET!);

export type Session = {
  id: number;
  matricule: string;
  codename: string;
  clearance: number;
  role: string;
  mustChangePassword?: boolean;
};

export async function createSession(user: Session) {
  const token = await new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("12h")
    .sign(secret());
  (await cookies()).set("shield_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 3600,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get("shield_session")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete("shield_session");
}

// Short-lived token embedded in file/callback URLs so the OnlyOffice server
// can fetch documents without a browser session. Carries the viewer's effective
// clearance, whether the served copy must be redacted, and whether the viewer is
// allowed to save edits (owner / invited / admin only — never granted by clearance).
export async function signFileToken(docId: number, clr = 10, red = false, edit = false) {
  return new SignJWT({ doc: docId, clr, red, edit })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(secret());
}

export async function readFileToken(token: string): Promise<{ doc: number; clr: number; red: boolean; edit: boolean } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return { doc: payload.doc as number, clr: (payload.clr as number) ?? 10, red: !!payload.red, edit: !!payload.edit };
  } catch {
    return null;
  }
}

export async function verifyFileToken(token: string, docId: number) {
  const p = await readFileToken(token);
  return !!p && p.doc === docId;
}
