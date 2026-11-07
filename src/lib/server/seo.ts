import "server-only";
import type { Metadata } from "next";
import { publicSite } from "@/lib/release";

export function publicMetadata(
  title: string,
  description: string,
  path: string,
  image?: { src: string; width: number; height: number; alt: string },
): Metadata {
  const site = publicSite(process.env);
  const url = site.origin ? new URL(path, site.origin).href : undefined;
  const images =
    site.origin && image
      ? [
          {
            url: new URL(image.src, site.origin).href,
            width: image.width,
            height: image.height,
            alt: image.alt,
          },
        ]
      : undefined;
  return {
    title,
    description,
    ...(site.origin
      ? { metadataBase: new URL(site.origin), alternates: { canonical: url } }
      : {}),
    robots: { index: site.index, follow: site.index },
    openGraph: {
      type: "website",
      siteName: "AUDACE",
      title,
      description,
      url,
      images,
      locale: "en_GH",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: images?.map((item) => ({ url: item.url, alt: item.alt })),
    },
  };
}
