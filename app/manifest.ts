import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "S.H.I.E.L.D. — Central Document System",
    short_name: "S.H.I.E.L.D.",
    description:
      "Strategic Homeland Intervention, Enforcement and Logistics Division — portail documentaire classifié.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#070b12",
    theme_color: "#070b12",
    lang: "fr",
    categories: ["productivity", "business"],
    icons: [
      {
        // Vectoriel : sert à la fois d'icône « any » et « maskable » à toute taille.
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any",
        purpose: "maskable",
      },
      // Repli raster pour les plateformes qui n'acceptent pas les icônes SVG.
      {
        src: "/logo.png",
        type: "image/png",
        sizes: "1024x1024",
        purpose: "any",
      },
    ],
  };
}
