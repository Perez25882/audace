import Link from "next/link";
import { CollectionFilter } from "@/components/collection-filter";
import { GarmentCard } from "@/components/garment-card";
import { GarmentImage } from "@/components/garment-image";
import { Arrow } from "@/components/icons";
import { sleeves } from "@/lib/catalogue";
import { getShop } from "@/lib/server/shop";
import { publicMetadata } from "@/lib/server/seo";

const featuredSlug = "burgundy-short-sleeve";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const shop = await getShop();
  const featured =
    shop.variants.find((item) => item.slug === featuredSlug) ??
    shop.variants[0];
  const metadata = publicMetadata(
    "The First Release",
    "Explore the first release from AUDACE, a Ghanaian premium menswear brand.",
    "/",
    featured?.images[0],
  );
  if (shop.mode !== "connected")
    metadata.robots = { index: false, follow: false };
  return metadata;
}

export default async function HomePage() {
  const { variants, mode } = await getShop();
  const featured =
    variants.find(({ slug }) => slug === featuredSlug) ?? variants[0];
  if (!featured)
    return (
      <section className="frame status" id="collection" tabIndex={-1}>
        <h1>The Collection</h1>
        <p>
          {mode === "unavailable"
            ? "The collection is temporarily unavailable. Please try again shortly."
            : "Check back for the next release."}
        </p>
      </section>
    );

  return (
    <>
      <section className="frame hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="kicker hero-kicker">
            <span aria-hidden="true" />
            The First Release
          </p>
          <h1 id="hero-title">
            Presence
            <br className="hero-break" /> Without
            <br /> Announcement.
          </h1>
          <p className="hero-description">Premium menswear from Ghana.</p>
          <Link className="button button-solid hero-button" href="#collection">
            Explore the collection <Arrow />
          </Link>
        </div>
        <figure className="hero-figure">
          <div className="hero-image">
            <GarmentImage
              asset={featured.images[0]}
              sizes="(min-width: 80rem) 465px, (min-width: 56rem) 42vw, 82vw"
              aboveFold
            />
          </div>
          <figcaption className="hero-caption">
            <span>Garment illustration</span>
            <Link href={`/products/${featured.slug}`}>
              {featured.colour}, {featured.sleeve.toLowerCase()}{" "}
              <Arrow direction="up-right" />
            </Link>
          </figcaption>
        </figure>
      </section>
      <section
        className="frame collection"
        id="collection"
        tabIndex={-1}
        aria-labelledby="collection-title"
      >
        <div className="collection-intro">
          <h2 id="collection-title">The Collection</h2>
          <p>Four colourways. Two sleeve lengths across the release.</p>
        </div>
        <CollectionFilter
          sleeves={sleeves}
          items={variants.map((variant) => ({
            slug: variant.slug,
            sleeve: variant.sleeve,
            card: <GarmentCard variant={variant} />,
          }))}
        />
      </section>
      <section className="frame detail-section" aria-labelledby="detail-title">
        <div className="detail-crop" aria-hidden="true">
          <GarmentImage
            asset={featured.images[0]}
            sizes="(min-width: 56rem) 900px, 100vw"
            decorative
          />
        </div>
        <div className="detail-copy">
          <p className="kicker">The design</p>
          <h2 id="detail-title">The details speak quietly.</h2>
          <p>
            A stand collar, tonal fabric-loop closures and a small label at the
            lower hem.
          </p>
          <Link href={`/products/${featured.slug}`}>
            View the {featured.colour} shirt <Arrow direction="up-right" />
          </Link>
        </div>
      </section>
    </>
  );
}
