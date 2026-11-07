import Image from "next/image";
import { garmentSource, type Variant } from "@/lib/catalogue";

export function GarmentImage({
  variant,
  sizes,
  aboveFold = false,
  decorative = false,
}: {
  variant: Variant;
  sizes: string;
  aboveFold?: boolean;
  decorative?: boolean;
}) {
  return (
    <Image
      src={garmentSource(variant)}
      alt={decorative ? "" : `${variant.colour} ${variant.sleeve.toLowerCase()} shirt, front view`}
      width={variant.width}
      height={variant.height}
      sizes={sizes}
      loading={aboveFold ? "eager" : undefined}
      fetchPriority={aboveFold ? "high" : undefined}
      className="garment-image"
    />
  );
}
