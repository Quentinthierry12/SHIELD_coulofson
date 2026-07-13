import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "S.H.I.E.L.D. — Système Documentaire Central",
  description: "Strategic Homeland Intervention, Enforcement and Logistics Division",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
