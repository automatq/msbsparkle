import type { MetadataRoute } from "next";
import { siteUrl } from "@/modules/shared/site";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/cleaner", "/account", "/api", "/login", "/verify"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
