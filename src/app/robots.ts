import type { MetadataRoute } from "next";
import { privatePaths, publicSite } from "@/lib/release";
export const dynamic = "force-dynamic";
export default function robots(): MetadataRoute.Robots {
  const site = publicSite(process.env);
  return site.index && site.origin
    ? {
        rules: { userAgent: "*", allow: "/", disallow: privatePaths },
        sitemap: site.origin + "/sitemap.xml",
      }
    : { rules: { userAgent: "*", disallow: "/" } };
}
