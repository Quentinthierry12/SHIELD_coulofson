import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secret = () => new TextEncoder().encode(process.env.APP_SECRET!);

export type Session = {
  id: number;
  matricule: string;
  codename: string;
  clearance: number;
  role: string;
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
// can fetch documents without a browser session.
export async function signFileToken(docId: number) {
  return new SignJWT({ doc: docId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(secret());
}

export async function verifyFileToken(token: string, docId: number) {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.doc === docId;
  } catch {
    return false;
  }
}
