import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/product-gallery";
import { PurchaseOptions } from "@/components/purchase-options";
import { Arrow } from "@/components/icons";
import { colours, findVariant, variants } from "@/lib/catalogue";
import { merchant } from "@/lib/merchant-config";
import { selectColourVariant, type Colour } from "@/lib/shop-model";

type ProductPageProps = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return variants.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const variant = findVariant((await params).slug);
  if (!variant) notFound();
  return {
    title: `${variant.colour} ${variant.name.toLowerCase()} / ${variant.sleeve}`,
    description: `${variant.colour} ${variant.sleeve.toLowerCase()} shirt from the first AUDACE release. ${variant.description}`,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const variant = findVariant((await params).slug);
  if (!variant) notFound();
  const { id, pricePesewas, sizes, published } = variant;
  const sleeveVariants = variants.filter(({ colour }) => colour === variant.colour);

  return (
    <article className="frame product">
      <nav className="product-crumbs" aria-label="Breadcrumb">
        <ol>
          <li><Link className="back-link" href="/#collection"><Arrow direction="left" /> The Collection</Link></li>
          <li><span aria-hidden="true">/</span> <span aria-current="page">{variant.colour} · {variant.sleeve}</span></li>
        </ol>
      </nav>
      <div className="product-layout">
        <ProductGallery key={id} images={variant.images} />
        <div className="product-copy">
          <p className="kicker">The First Release</p>
          <h1>{variant.colour} <span>{variant.name}</span></h1>
          <p className="product-id">{variant.sleeve} <span aria-hidden="true">/</span> <span><span className="sr-only">SKU </span>{variant.sku}</span></p>
          <p className="product-description">{variant.description}</p>
          <nav className="variant-group" aria-labelledby="colour-label">
            <h2 id="colour-label">Colour <span>{variant.colour}</span></h2>
            <ul className="colour-options">
              {(Object.keys(colours) as Colour[]).map((colour) => {
                const other = selectColourVariant(variants, colour, variant.sleeve);
                if (!other) return null;
                return (
                  <li key={colour}>
                    <Link href={`/products/${other.slug}`} scroll={false} aria-current={other.id === id ? "page" : undefined} aria-label={`${colour}, ${other.sleeve.toLowerCase()}`} title={`${colour} / ${other.sleeve}`}>
                      <span className="swatch" aria-hidden="true" style={{ backgroundColor: colours[colour] }} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          {sleeveVariants.length > 1 ? (
            <nav className="variant-group" aria-labelledby="sleeve-label">
              <h2 id="sleeve-label">Sleeve <span>{variant.sleeve}</span></h2>
              <ul className="sleeve-options">
                {sleeveVariants.map((other) => (
                  <li key={other.id}>
                    <Link href={`/products/${other.slug}`} scroll={false} aria-current={other.id === id ? "page" : undefined}>{other.sleeve}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : (
            <div className="variant-group single-sleeve"><h2>Sleeve <span>{variant.sleeve}</span></h2></div>
          )}
          <PurchaseOptions key={id} variant={{ id, pricePesewas, sizes, published }} />
          <div className="product-information">
            <details><summary>Size guide</summary><p>{variant.sizeGuide ?? "Size guidance will be published when measurements are confirmed."}</p></details>
            <details><summary>Shipping and returns</summary><p>{merchant.shippingReturns ?? "Shipping and returns information will be published when confirmed."}</p></details>
            {variant.specifications.length > 0 && (
              <details>
                <summary>Specifications</summary>
                <dl>{variant.specifications.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
              </details>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
