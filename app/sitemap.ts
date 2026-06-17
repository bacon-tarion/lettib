import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: "https://www.lettib.com",
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: "https://www.lettib.com/pricing",
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://www.lettib.com/contact",
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: "https://www.lettib.com/privacy",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://www.lettib.com/terms",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: "https://www.lettib.com/cookie-policy",
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
