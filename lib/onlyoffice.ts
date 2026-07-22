import { SignJWT, jwtVerify } from "jose";
import { brand } from "./brand";

const ooSecret = () => new TextEncoder().encode(process.env.OO_JWT_SECRET!);

export const DS_URL = () => process.env.DS_PUBLIC_URL!; // ex: https://shield-office.quentinthierry.fr
export const PORTAL_URL = () => process.env.PORTAL_URL!; // ex: https://shield.quentinthierry.fr

export const DOC_TYPES: Record<string, { documentType: string; mime: string }> = {
  docx: { documentType: "word", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  xlsx: { documentType: "cell", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  pptx: { documentType: "slide", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
};

// Approach A — S.H.I.E.L.D. reskin via the official customization API (no image patch).
// Dark theme, agency branding in the About dialog, and ONLYOFFICE marketing removed
// for a clean internal-tool feel.
export const SHIELD_CLASSIFY_GUID = "asc.{7A1E1D02-9C3B-4F5A-B7E1-51D3C0FFEE01}";

// Must stay a BUILT-IN theme id. DS 9.3's api.js only ever appends `&uitheme=<id>` to the
// editor URL — never `&uithemetype=` — so the bootstrap in index.html cannot know a custom
// theme's type (themes.json loads later) and leaves the body on theme-type-light. Built-in
// themes dodge this: their colours are precompiled in app.css under `.theme-dark`, so the
// body class alone is enough. We therefore repaint `.theme-dark` itself in the image
// (office-theme/Dockerfile.shield) instead of registering theme-shield-dark.
export const SHIELD_CUSTOMIZATION = {
  uiTheme: "theme-dark",
  compactHeader: false,
  hideRightMenu: true,
  toolbarNoTabs: false,
  feedback: false,
  goback: false,
  // Header logo. Without this the editor shows the stock ONLYOFFICE mark.
  logo: {
    image: `${process.env.PORTAL_URL}/logo-white.png`,
    imageDark: `${process.env.PORTAL_URL}/logo-white.png`,
    url: process.env.PORTAL_URL,
  },
  customer: {
    name: brand.name,
    info: `${brand.full} — ${brand.tagline}`,
    logo: `${process.env.PORTAL_URL}/logo-white.png`,
    www: process.env.PORTAL_URL,
    mail: "",
    address: "Classified",
  },
};

export async function signOOConfig(config: object) {
  return new SignJWT(config as any)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(ooSecret());
}

export async function verifyOOToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, ooSecret());
    return payload as any;
  } catch {
    return null;
  }
}
