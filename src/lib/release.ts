import type { Variant } from "./shop-model";

export function publicSite(env: Record<string, string | undefined>) {
  try {
    const url = new URL(env.AUDACE_PUBLIC_ORIGIN ?? "");
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      return { origin: null, index: false };
    return {
      origin: url.origin,
      index: env.AUDACE_INDEXING_ENABLED === "true",
    };
  } catch {
    return { origin: null, index: false };
  }
}
export const privatePaths = [
  "/admin",
  "/bag",
  "/checkout",
  "/payment-status",
  "/order-confirmation",
  "/api",
];
export function privateRoute(path: string) {
  return privatePaths.some(
    (base) => path === base || path.startsWith(base + "/"),
  );
}
export function contentPolicy(
  nonce: string,
  development: boolean,
  https: boolean,
) {
  return [
    "default-src 'self'",
    "script-src 'self' 'nonce-" +
      nonce +
      "' 'strict-dynamic'" +
      (development ? " 'unsafe-eval'" : ""),
    "style-src 'self' 'nonce-" + nonce + "'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'" + (development ? " ws: wss:" : ""),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
export function productEvidence(variant: Variant, origin: string) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: variant.colour + " " + variant.name + " / " + variant.sleeve,
    description: variant.description,
    sku: variant.sku,
    color: variant.colour,
    brand: { "@type": "Brand", name: "AUDACE" },
    image: variant.images.map((image) => new URL(image.src, origin).href),
    url: new URL("/products/" + variant.slug, origin).href,
  };
  if (
    typeof variant.pricePesewas === "number" &&
    Number.isSafeInteger(variant.pricePesewas) &&
    variant.pricePesewas > 0 &&
    variant.published &&
    variant.sizes.length &&
    variant.sizes.every(
      (size) =>
        typeof size.stock === "number" &&
        Number.isSafeInteger(size.stock) &&
        size.stock >= 0,
    )
  ) {
    data.offers = {
      "@type": "Offer",
      url: data.url,
      priceCurrency: "GHS",
      price: (variant.pricePesewas / 100).toFixed(2),
      availability: variant.sizes.some((size) => (size.stock ?? 0) > 0)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    };
  }
  return data;
}
export function structuredJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
