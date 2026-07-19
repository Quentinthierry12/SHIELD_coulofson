import "./globals.css";
import type { Metadata, Viewport } from "next";
import UiHost from "./ui-host";
import PwaRegister from "./pwa-register";
import NotifInvite from "./notif-invite";

export const metadata: Metadata = {
  title: "S.H.I.E.L.D. — Central Document System",
  description: "Strategic Homeland Intervention, Enforcement and Logistics Division",
  applicationName: "S.H.I.E.L.D.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    // Icône de l'écran d'accueil iOS : DOIT être un PNG opaque. L'ancien logo-white.png
    // (aigle blanc sur fond transparent) s'affichait tout blanc une fois installé.
    apple: [{ url: "/icon-512.png" }],
  },
  appleWebApp: {
    capable: true,
    title: "S.H.I.E.L.D.",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070b12",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <UiHost />
        <PwaRegister />
        <NotifInvite />
      </body>
    </html>
  );
}
