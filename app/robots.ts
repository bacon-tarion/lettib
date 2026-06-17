import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/projects",
        "/compare",
        "/manual-compare",
        "/chat",
        "/teams",
        "/settings",
        "/usage",
        "/api",
      ],
    },
    sitemap: "https://www.lettib.com/sitemap.xml",
  };
}
