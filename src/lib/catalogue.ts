import "server-only";

import type { Colour, Sleeve, Variant } from "./shop-model";

export type { Sleeve, Variant } from "./shop-model";

export const colours = {
  Cream: "#e2d6c5",
  Black: "#221e1d",
  Burgundy: "#601b2f",
  White: "#fff",
} satisfies Record<Colour, string>;

export const sleeves = ["Short sleeve", "Long sleeve"] as const satisfies readonly Sleeve[];

const illustrations = [
  ["cream-short-sleeve", "CR-SS", "Cream", "Short sleeve", 742, 764],
  ["black-short-sleeve", "BK-SS", "Black", "Short sleeve", 742, 764],
  ["burgundy-short-sleeve", "BG-SS", "Burgundy", "Short sleeve", 742, 764],
  ["white-short-sleeve", "WH-SS", "White", "Short sleeve", 742, 764],
  ["cream-long-sleeve", "CR-LS", "Cream", "Long sleeve", 742, 764],
  ["black-long-sleeve", "BK-LS", "Black", "Long sleeve", 741, 765],
  ["burgundy-long-sleeve", "BG-LS", "Burgundy", "Long sleeve", 741, 765],
] as const;

const description = "A stand collar, three tonal fabric-loop fastenings and a small label at the lower hem.";

export const variants: readonly Variant[] = illustrations
  .map(([slug, code, colour, sleeve, width, height]): Variant => ({
    id: `audace-${code.toLowerCase()}`,
    sku: `AUD-${code}`,
    name: "Stand-collar shirt",
    slug,
    colour,
    sleeve,
    images: [{
      src: `/garments/${slug}.webp`,
      width,
      height,
      alt: `${colour} ${sleeve.toLowerCase()} shirt, front view`,
      label: "Front view",
    }],
    pricePesewas: null,
    sizes: [],
    published: true,
    description,
    specifications: [],
    sizeGuide: null,
  }));
