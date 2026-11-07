import "server-only";

export type Colour = "Cream" | "Black" | "Burgundy" | "White";
export type Sleeve = "Short sleeve" | "Long sleeve";

export type Variant = {
  slug: string;
  colour: Colour;
  sleeve: Sleeve;
  width: number;
  height: number;
  reference: { page: number; position: "top" | "bottom"; xref: number };
};

export const colours = {
  Cream: "#e2d6c5",
  Black: "#221e1d",
  Burgundy: "#601b2f",
  White: "#fff",
} satisfies Record<Colour, string>;

export const sleeves = ["Short sleeve", "Long sleeve"] as const satisfies readonly Sleeve[];

export const variants: readonly Variant[] = [
  { slug: "cream-short-sleeve", colour: "Cream", sleeve: "Short sleeve", width: 742, height: 764, reference: { page: 1, position: "top", xref: 19 } },
  { slug: "black-short-sleeve", colour: "Black", sleeve: "Short sleeve", width: 742, height: 764, reference: { page: 2, position: "top", xref: 23 } },
  { slug: "burgundy-short-sleeve", colour: "Burgundy", sleeve: "Short sleeve", width: 742, height: 764, reference: { page: 3, position: "top", xref: 27 } },
  { slug: "white-short-sleeve", colour: "White", sleeve: "Short sleeve", width: 742, height: 764, reference: { page: 4, position: "top", xref: 32 } },
  { slug: "cream-long-sleeve", colour: "Cream", sleeve: "Long sleeve", width: 742, height: 764, reference: { page: 1, position: "bottom", xref: 20 } },
  { slug: "black-long-sleeve", colour: "Black", sleeve: "Long sleeve", width: 741, height: 765, reference: { page: 2, position: "bottom", xref: 24 } },
  { slug: "burgundy-long-sleeve", colour: "Burgundy", sleeve: "Long sleeve", width: 741, height: 765, reference: { page: 3, position: "bottom", xref: 28 } },
];

export function findVariant(slug: string) {
  return variants.find((variant) => variant.slug === slug);
}

export function garmentSource(variant: Variant) {
  return `/garments/${variant.slug}.webp`;
}
