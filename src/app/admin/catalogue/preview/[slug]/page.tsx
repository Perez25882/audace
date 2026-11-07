import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/product-gallery";
import { formatGhs } from "@/lib/bag";
import type { GarmentAsset } from "@/lib/shop-model";
import { requireAdmin } from "@/lib/server/admin";
import { AdminPage } from "../../../admin-ui";

type Preview = {
  colour: string; sleeve: string; code: string; published: boolean; price_pesewas: number | null;
  audace_products: { name: string; description: string; size_guide: string | null; published: boolean };
  audace_images: (Omit<GarmentAsset, "src"> & { path: string; position: number })[];
  audace_skus: { size: string; active: boolean }[];
};

export default async function ListingPreview({ params }: { params: Promise<{ slug: string }> }) {
  const { client, role } = await requireAdmin();
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const { data: variant, error } = await client.from("audace_variants")
    .select("colour,sleeve,code,published,price_pesewas,audace_products!inner(name,description,size_guide,published),audace_images(path,width,height,alt,label,position),audace_skus(size,active)")
    .eq("slug",slug).maybeSingle().overrideTypes<Preview, { merge: false }>();
  if (error) throw new Error("Listing preview is temporarily unavailable.");
  if (!variant) notFound();

  const product = variant.audace_products;
  const [first, ...images] = variant.audace_images.toSorted((a,b) => a.position - b.position)
    .map(({ path, width, height, alt, label }) => ({ src: path, width, height, alt, label }));
  const sizes = variant.audace_skus.filter(({ active }) => active).map(({ size }) => size);

  return <AdminPage title="Listing preview" role={role}>
    <Link className="back-link" href="/admin/catalogue">Back to catalogue</Link>
    <p className="shop-notice">{variant.published && product.published ? "Published listing" : "Hidden listing"} · Private preview</p>
    <article className="product product-layout">
      {first ? <ProductGallery images={[first,...images]} /> : <p>Artwork awaits configuration.</p>}
      <div className="product-copy">
        <p className="kicker">The First Release</p>
        <h2 className="shop-heading">{variant.colour} {product.name.toLowerCase()}</h2>
        <p>{variant.sleeve} · {variant.code}</p>
        <p className="product-description">{product.description}</p>
        <p>{variant.price_pesewas === null ? "Price to be confirmed" : formatGhs(variant.price_pesewas)}</p>
        <p>{sizes.length ? sizes.join(", ") : "Sizes to be confirmed."}</p>
        {product.size_guide && <details className="product-information"><summary>Size guide</summary><p>{product.size_guide}</p></details>}
      </div>
    </article>
  </AdminPage>;
}
