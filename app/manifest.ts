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
      // Repli raster OPAQUE (fond sombre + aigle) pour les plateformes qui n'acceptent
      // pas le SVG. Remplace l'ancien logo.png (aigle sombre sur fond transparent, qui
      // s'affichait tout blanc ou invisible selon le fond).
      {
        src: "/icon-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        type: "image/png",
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
  };
}
