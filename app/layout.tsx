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
      { url: "/logo.png", type: "image/png" },
    ],
    apple: [{ url: "/logo-white.png" }],
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
