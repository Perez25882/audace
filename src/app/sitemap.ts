import type { MetadataRoute } from "next";
import { publicSite } from "@/lib/release";
import { getShop } from "@/lib/server/shop";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = publicSite(process.env);
  if (!site.index || !site.origin) return [];
  const shop = await getShop();
  if (shop.mode !== "connected")
    throw new Error("Published catalogue unavailable for sitemap");
  return [
    { url: site.origin },
    ...shop.variants
      .filter((item) => item.published)
      .map((item) => ({ url: site.origin + "/products/" + item.slug })),
  ];
}
