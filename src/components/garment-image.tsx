import Image from "next/image";
import type { GarmentAsset } from "@/lib/shop-model";

export function GarmentImage({
  asset, sizes, aboveFold = false, decorative = false, original = false,
}: {
  asset: GarmentAsset;
  sizes: string;
  aboveFold?: boolean;
  decorative?: boolean;
  original?: boolean;
}) {
  return (
    <Image
      src={asset.src}
      alt={decorative ? "" : asset.alt}
      width={asset.width}
      height={asset.height}
      sizes={original ? undefined : sizes}
      unoptimized={original}
      loading={aboveFold ? "eager" : undefined}
      fetchPriority={aboveFold ? "high" : undefined}
      className="garment-image"
    />
  );
}
