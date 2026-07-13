import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "S.H.I.E.L.D. — Central Document System",
  description: "Strategic Homeland Intervention, Enforcement and Logistics Division",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
