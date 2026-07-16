import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/privacy", "/terms", "/support"];
  return routes.map((route) => ({
    url: `https://parkquest.me${route}`,
    lastModified: new Date(),
  }));
}
