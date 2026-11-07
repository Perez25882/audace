import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GarmentImage } from "@/components/garment-image";
import { Arrow } from "@/components/icons";
import { colours, findVariant, sleeves, variants } from "@/lib/catalogue";

type ProductPageProps = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return variants.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const variant = findVariant((await params).slug);
  if (!variant) notFound();

  return {
    title: `${variant.colour} / ${variant.sleeve}`,
    description: `The ${variant.colour.toLowerCase()} ${variant.sleeve.toLowerCase()} shirt from the first AUDACE release.`,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const variant = findVariant((await params).slug);
  if (!variant) notFound();

  return (
    <article className="frame product">
      <Link className="back-link" href="/#collection"><Arrow direction="left" /> The Collection</Link>
      <div className="product-layout">
        <figure className="product-figure">
          <div className="product-image">
            <GarmentImage variant={variant} sizes="(min-width: 80rem) 570px, (min-width: 52rem) 52vw, 88vw" aboveFold />
          </div>
          <figcaption>Front view <span aria-hidden="true">/</span> Garment illustration</figcaption>
        </figure>
        <div className="product-copy">
          <p className="kicker">The First Release</p>
          <h1>{variant.colour}</h1>
          <p className="product-sleeve">{variant.sleeve} shirt</p>
          <p className="product-description">A stand collar, tonal fabric-loop closures and a small label at the lower hem.</p>
          <nav className="variant-group" aria-labelledby="colour-label">
            <h2 id="colour-label">Colour <span>{variant.colour}</span></h2>
            <ul className="colour-options">
              {(Object.keys(colours) as (keyof typeof colours)[]).map((colour) => {
                const other = variants.find((item) => item.colour === colour && item.sleeve === variant.sleeve)
                  ?? variants.find((item) => item.colour === colour);
                if (!other) return null;
                return (
                  <li key={colour}>
                    <Link href={`/products/${other.slug}`} aria-current={other.slug === variant.slug ? "page" : undefined} aria-label={`${colour}, ${other.sleeve.toLowerCase()}`} title={`${colour} / ${other.sleeve}`}>
                      <span className="swatch" aria-hidden="true" style={{ backgroundColor: colours[colour] }} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <nav className="variant-group" aria-labelledby="sleeve-label">
            <h2 id="sleeve-label">Sleeve <span>{variant.sleeve}</span></h2>
            <ul className="sleeve-options">
              {sleeves.map((sleeve) => {
                const other = variants.find((item) => item.colour === variant.colour && item.sleeve === sleeve);
                return other ? (
                  <li key={sleeve}>
                    <Link href={`/products/${other.slug}`} aria-current={other.slug === variant.slug ? "page" : undefined}>{sleeve}</Link>
                  </li>
                ) : null;
              })}
            </ul>
          </nav>
          <p className="product-status">Available to browse. Ordering has yet to open.</p>
        </div>
      </div>
    </article>
  );
}
