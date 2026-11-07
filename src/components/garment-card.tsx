import Link from "next/link";
import { colours, type Variant } from "@/lib/catalogue";
import { Arrow } from "./icons";
import { GarmentImage } from "./garment-image";

export function GarmentCard({ variant }: { variant: Variant }) {
  return (
    <Link className="garment-card" href={`/products/${variant.slug}`}>
      <div className="card-image">
        <GarmentImage asset={variant.images[0]} sizes="(min-width: 80rem) 265px, (min-width: 58rem) 22vw, (min-width: 40rem) 30vw, 45vw" decorative />
      </div>
      <div className="card-caption">
        <div>
          <h3>{variant.colour}</h3>
          <p><span className="swatch" aria-hidden="true" style={{ backgroundColor: colours[variant.colour] }} />{variant.sleeve}</p>
        </div>
        <span className="card-arrow"><Arrow direction="up-right" /></span>
      </div>
    </Link>
  );
}
