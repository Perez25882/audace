export type Colour = "Cream" | "Black" | "Burgundy" | "White";
export type Sleeve = "Short sleeve" | "Long sleeve";

export type GarmentAsset = {
  src: string;
  width: number;
  height: number;
  alt: string;
  label: string;
};

export type SizeOption = { label: string; stock: number | null };

export type Variant = {
  id: string;
  sku: string;
  name: string;
  slug: string;
  colour: Colour;
  sleeve: Sleeve;
  images: readonly [GarmentAsset, ...GarmentAsset[]];
  pricePesewas: number | null;
  sizes: readonly SizeOption[];
  published: boolean;
  description: string;
  specifications: readonly { label: string; value: string }[];
  sizeGuide: string | null;
};

export const regions = [
  "Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern",
  "Greater Accra", "North East", "Northern", "Oti", "Savannah",
  "Upper East", "Upper West", "Volta", "Western", "Western North",
] as const;

export type Region = typeof regions[number];
export type DeliveryMethod = {
  id: string;
  label: string;
  feePesewas: number;
  regions: readonly Region[];
};

export function selectColourVariant<T extends Pick<Variant, "colour" | "sleeve">>(
  variants: readonly T[], colour: Colour, sleeve: Sleeve,
) {
  return variants.find((variant) => variant.colour === colour && variant.sleeve === sleeve)
    ?? variants.find((variant) => variant.colour === colour);
}
