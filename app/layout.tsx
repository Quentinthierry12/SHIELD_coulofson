import "./globals.css";
import type { Metadata, Viewport } from "next";
import UiHost from "./ui-host";
import PwaRegister from "./pwa-register";
import NotifInvite from "./notif-invite";
import DesktopPortalBridge from "./desktop-portal";

export const metadata: Metadata = {
  title: "S.H.I.E.L.D. — Central Document System",
  description: "The division's classified document portal — reports, registries and signature workflows.",
  applicationName: "S.H.I.E.L.D.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    // iOS home-screen icon: MUST be an opaque PNG. The old logo-white.png (white eagle on a
    // transparent background) showed up all-white once installed.
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
        <DesktopPortalBridge />
      </body>
    </html>
  );
}
