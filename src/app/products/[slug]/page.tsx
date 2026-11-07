import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { productEvidence, publicSite, structuredJson } from "@/lib/release";
import { publicMetadata } from "@/lib/server/seo";
import { ProductGallery } from "@/components/product-gallery";
import { PurchaseOptions } from "@/components/purchase-options";
import { Arrow } from "@/components/icons";
import { colours } from "@/lib/catalogue";
import { getShop } from "@/lib/server/shop";
import { Status } from "@/components/status";
import { selectColourVariant, type Colour } from "@/lib/shop-model";

type ProductPageProps = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { variants, mode } = await getShop();
  const variant = variants.find((item) => item.slug === slug);
  if (mode === "unavailable")
    return {
      title: "Collection temporarily unavailable",
      robots: { index: false },
    };
  if (!variant) notFound();
  const metadata = publicMetadata(
    `${variant.colour} ${variant.name.toLowerCase()} / ${variant.sleeve}`,
    `${variant.colour} ${variant.sleeve.toLowerCase()} shirt from the first AUDACE release. ${variant.description}`,
    `/products/${variant.slug}`,
    variant.images[0],
  );
  if (mode !== "connected") metadata.robots = { index: false, follow: false };
  return metadata;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const { variants, mode, shippingReturns } = await getShop();
  const variant = variants.find((item) => item.slug === slug);
  if (mode === "unavailable")
    return (
      <Status
        title="Collection temporarily unavailable."
        description="Try loading this garment again shortly."
      />
    );
  if (!variant) notFound();
  const { id, pricePesewas, sizes, published } = variant;
  const sleeveVariants = variants.filter(
    ({ colour }) => colour === variant.colour,
  );
  const site = publicSite(process.env);
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <article className="frame product">
      {site.origin && mode === "connected" && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: structuredJson(productEvidence(variant, site.origin)),
          }}
        />
      )}
      <nav className="product-crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link className="back-link" href="/#collection">
              <Arrow direction="left" /> The Collection
            </Link>
          </li>
          <li>
            <span aria-hidden="true">/</span>{" "}
            <span aria-current="page">
              {variant.colour} · {variant.sleeve}
            </span>
          </li>
        </ol>
      </nav>
      <div className="product-layout">
        <ProductGallery key={id} images={variant.images} />
        <div className="product-copy">
          <p className="kicker">The First Release</p>
          <h1>
            {variant.colour} <span>{variant.name}</span>
          </h1>
          <p className="product-id">
            {variant.sleeve} <span aria-hidden="true">/</span>{" "}
            <span>
              <span className="sr-only">SKU </span>
              {variant.sku}
            </span>
          </p>
          <p className="product-description">{variant.description}</p>
          <nav className="variant-group" aria-labelledby="colour-label">
            <h2 id="colour-label">
              Colour <span>{variant.colour}</span>
            </h2>
            <ul className="colour-options">
              {(Object.keys(colours) as Colour[]).map((colour) => {
                const other = selectColourVariant(
                  variants,
                  colour,
                  variant.sleeve,
                );
                if (!other) return null;
                return (
                  <li key={colour}>
                    <Link
                      href={`/products/${other.slug}`}
                      scroll={false}
                      aria-current={other.id === id ? "page" : undefined}
                      aria-label={`${colour}, ${other.sleeve.toLowerCase()}`}
                      title={`${colour} / ${other.sleeve}`}
                    >
                      <span
                        className="swatch"
                        aria-hidden="true"
                        style={{ backgroundColor: colours[colour] }}
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {sleeveVariants.length > 1 ? (
            <nav className="variant-group" aria-labelledby="sleeve-label">
              <h2 id="sleeve-label">
                Sleeve <span>{variant.sleeve}</span>
              </h2>
              <ul className="sleeve-options">
                {sleeveVariants.map((other) => (
                  <li key={other.id}>
                    <Link
                      href={`/products/${other.slug}`}
                      scroll={false}
                      aria-current={other.id === id ? "page" : undefined}
                    >
                      {other.sleeve}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : (
            <div className="variant-group single-sleeve">
              <h2>
                Sleeve <span>{variant.sleeve}</span>
              </h2>
            </div>
          )}
          <PurchaseOptions
            key={id}
            variant={{ id, pricePesewas, sizes, published }}
          />
          <div className="product-information">
            <details>
              <summary>Size guide</summary>
              <p>
                {variant.sizeGuide ??
                  "Size guidance will be published when measurements are confirmed."}
              </p>
            </details>
            <details>
              <summary>Shipping and returns</summary>
              <p>
                {shippingReturns ??
                  "Shipping and returns information will be published when confirmed."}
              </p>
            </details>
            {variant.specifications.length > 0 && (
              <details>
                <summary>Specifications</summary>
                <dl>
                  {variant.specifications.map(({ label, value }) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
