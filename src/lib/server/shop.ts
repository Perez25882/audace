import "server-only";

import { cache } from "react";
import { variants as illustrationCatalogue } from "@/lib/catalogue";
import type { DeliveryMethod, Variant } from "@/lib/shop-model";
import { backendConfig, dataClient } from "./supabase";

type ShopData = {
  variants: readonly Variant[];
  methods: readonly DeliveryMethod[];
  shippingReturns: string | null;
  mode: "connected" | "preview" | "unavailable";
};

const unavailable: ShopData = { variants: [], methods: [], shippingReturns: null, mode: "unavailable" };

export const getShop = cache(async (): Promise<ShopData> => {
  try {
    if (!backendConfig()) {
      return { variants: illustrationCatalogue, methods: [], shippingReturns: null, mode: "preview" };
    }
    const { data, error } = await dataClient().rpc("audace_public_shop").abortSignal(AbortSignal.timeout(5000));
    if (error || !data || !Array.isArray(data.variants) || !Array.isArray(data.methods)
      || !data.variants.every((variant: Variant) => variant?.published && Array.isArray(variant.images) && variant.images.length)) {
      return unavailable;
    }
    return { variants: data.variants, methods: data.methods, shippingReturns: data.shippingReturns ?? null, mode: "connected" };
  } catch {
    return unavailable;
  }
});
