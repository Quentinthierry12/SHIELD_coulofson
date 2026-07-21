import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${brand.name} — ${brand.tagline}`,
    short_name: brand.short,
    description: `The ${brand.terms.division.toLowerCase()}'s classified document portal — reports, registries and signature workflows.`,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#070b12",
    theme_color: "#070b12",
    lang: "en",
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
