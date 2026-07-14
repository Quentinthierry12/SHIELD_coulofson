import "./globals.css";
import type { Metadata } from "next";
import UiHost from "./ui-host";

export const metadata: Metadata = {
  title: "S.H.I.E.L.D. — Central Document System",
  description: "Strategic Homeland Intervention, Enforcement and Logistics Division",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <UiHost />
      </body>
    </html>
  );
}
