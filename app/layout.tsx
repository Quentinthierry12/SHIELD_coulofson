import "./globals.css";
import type { Metadata, Viewport } from "next";
import { brand } from "@/lib/brand";
import UiHost from "./ui-host";
import PwaRegister from "./pwa-register";
import NotifInvite from "./notif-invite";

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description: `The ${brand.terms.division.toLowerCase()}'s classified document portal — reports, registries and signature workflows.`,
  applicationName: brand.short,
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
    title: brand.short,
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
      <head>
        {/* Per-faction accent — overrides the --accent token from globals.css when set. */}
        <style dangerouslySetInnerHTML={{ __html: `:root{--accent:${brand.accent};}` }} />
      </head>
      <body>
        {children}
        <UiHost />
        <PwaRegister />
        <NotifInvite />
      </body>
    </html>
  );
}
