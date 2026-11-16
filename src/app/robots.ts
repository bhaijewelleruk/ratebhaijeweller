import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/gold-bars",
          "/silver",
          "/sell-bullion",
          "/sell-your-gold",
          "/offers",
          "/zakat",
          "/find-us",
          "/contact",
          "/privacy-policy",
        ],
        disallow: ["/admin", "/api/"],
      },
    ],
    sitemap: "https://bhaijeweller.com/sitemap.xml",
  };
}

