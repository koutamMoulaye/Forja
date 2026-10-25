import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Forja",
    short_name: "Forja",
    description: "Pipelines de données Bronze, Silver et Gold, relus règle par règle.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f4f6",
    theme_color: "#15171b",
    lang: "fr",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/brand/forja-monogram.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
