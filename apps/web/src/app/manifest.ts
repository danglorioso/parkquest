import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ParkQuest",
    short_name: "ParkQuest",
    description: "Track your visits, earn badges, and explore national parks across the country.",
    start_url: "/",
    display: "standalone",
    background_color: "#F2EBDB",
    theme_color: "#1F3D2E",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
