import type { MetadataRoute } from "next";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (
    process.env.NODEZUNO_PUBLIC_INDEXING !== "true" ||
    process.env.NODEZUNO_LEGAL_LAUNCH_APPROVED !== "true"
  ) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/account",
        "/admin",
        "/api",
        "/forgot-password",
        "/identity-required",
        "/login",
        "/review",
        "/reset-password",
        "/signup",
        "/community/newsletter/confirm",
        "/community/newsletter/unsubscribe",
      ],
    },
    sitemap: "https://nodezuno.com/sitemap.xml",
    host: "https://nodezuno.com",
  };
}
