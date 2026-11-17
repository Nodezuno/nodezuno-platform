import type { MetadataRoute } from "next";
import { getAllPagePaths } from "../lib/site-data.ts";
import { permanentPublicRedirectTarget } from "../lib/public-navigation.ts";

const publishedAt = new Date("2026-08-10T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://nodezuno.com/",
      lastModified: publishedAt,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...getAllPagePaths()
      .filter((path) => !permanentPublicRedirectTarget(path))
      .map((path) => ({
        url: `https://nodezuno.com/${path}`,
        lastModified: publishedAt,
        changeFrequency:
          path === "status"
            ? ("always" as const)
            : path === "docs" || path === "whitepaper"
              ? ("monthly" as const)
              : ("weekly" as const),
        priority:
          path === "docs" || path === "whitepaper"
            ? 0.9
            : path === "product" || path.startsWith("product/")
              ? 0.8
              : 0.7,
      })),
  ];
}
