import type { MetadataRoute } from "next";

const BASE_URL = "https://roofix.com.au";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/control-centre",
        "/control-centre/",
        "/api/",
        "/not-found",
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
