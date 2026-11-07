import type { MerchantConfig } from "@/lib/shop-model";

// FICTIONAL TEST DATA. Copied only into the temporary browser-test application.
export const merchant: MerchantConfig = {
  variants: {
    "cream-short-sleeve": {
      pricePesewas: 39995,
      sizes: [{ label: "Fixture A", stock: 4 }, { label: "Fixture B", stock: 2 }],
    },
    "cream-long-sleeve": {
      pricePesewas: 54900,
      sizes: [{ label: "Fixture A", stock: 2 }, { label: "Fixture B", stock: 0 }],
    },
    "black-long-sleeve": { published: false },
  },
  deliveryMethods: [{ id: "fixture-courier", label: "Fixture courier", feePesewas: 1250, regions: ["Greater Accra"] }],
  shippingReturns: null,
};
