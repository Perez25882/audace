import Image from "next/image";
import Link from "next/link";
import { formatGhs } from "@/lib/bag";
import { moneyInput, queryValue, requireAdmin, requireData, type Search } from "@/lib/server/admin";
import { saveAdmin } from "../actions";
import { AdminPage, ResultNotice } from "../admin-ui";
import { Submit } from "../submit";

type CatalogueProduct = {
  id: string; name: string; description: string; size_guide: string | null; published: boolean;
  audace_variants: {
    id: string; slug: string; code: string; colour: string; sleeve: string; price_pesewas: number | null;
    published: boolean; sort_order: number;
    audace_images: { path: string; width: number; height: number; alt: string; position: number }[];
    audace_skus: { id: string; code: string; size: string; active: boolean }[];
  }[];
};

export default async function Catalogue({ searchParams }: { searchParams: Search }) {
  const { client, role } = await requireAdmin();
  const products: CatalogueProduct[] = requireData(await client.from("audace_products")
    .select("id,name,description,size_guide,published,audace_variants(id,slug,code,colour,sleeve,price_pesewas,published,sort_order,audace_images(path,width,height,alt,position),audace_skus(id,code,size,active))")
    .order("name"));
  return <AdminPage title="Catalogue" role={role}>
    <ResultNotice result={queryValue(await searchParams,"result")} />
    {!products.length && <p>Run the catalogue migration to load the approved collection.</p>}
    {products.map((product) => <section key={product.id} className="admin-section">
      <h2>{product.name}</h2>
      {role === "owner" ? (
        <form className="admin-form" action={saveAdmin}>
          <input type="hidden" name="operation" value="product" /><input type="hidden" name="id" value={product.id} />
          <label>Description <textarea name="description" defaultValue={product.description} maxLength={2000} rows={3} required /></label>
          <label>Approved size guide <textarea name="sizeGuide" defaultValue={product.size_guide ?? ""} maxLength={2000} rows={2} /></label>
          <label className="admin-check"><input type="checkbox" name="published" defaultChecked={product.published} /> Publish product</label>
          <Submit>Save product</Submit>
        </form>
      ) : <p>{product.description}</p>}
      <div className="admin-grid">
        {product.audace_variants.toSorted((a,b) => a.sort_order - b.sort_order).map((variant) => {
          const image = variant.audace_images.toSorted((a,b) => a.position - b.position)[0];
          return <article key={variant.id} className="admin-panel">
            <div className="admin-variant">
              {image && <Image src={image.path} width={image.width} height={image.height} sizes="92px" alt={image.alt} />}
              <div><h3>{variant.colour} · {variant.sleeve}</h3><p>{variant.code}</p>
                {product.published && variant.published ? <Link className="text-action" href={`/products/${variant.slug}`}>View public listing</Link>
                  : <p>Hidden from the collection</p>}
                <Link className="text-action" href={`/admin/catalogue/preview/${variant.slug}`}>Preview listing</Link>
              </div>
            </div>
            {role === "owner" ? <form action={saveAdmin} className="admin-form">
              <input type="hidden" name="operation" value="variant" /><input type="hidden" name="id" value={variant.id} />
              <label>Price in GHS <input name="price" inputMode="decimal" maxLength={11} defaultValue={moneyInput(variant.price_pesewas)} /></label>
              <label className="admin-check"><input type="checkbox" name="published" defaultChecked={variant.published} /> Publish variant</label>
              <Submit>Save variant</Submit>
            </form> : <p>{variant.price_pesewas === null ? "Price pending" : formatGhs(variant.price_pesewas)}</p>}
            <h4>Size SKUs</h4>
            {!variant.audace_skus.length && <p>Sizes awaiting approval.</p>}
            <ul>{variant.audace_skus.map((size) => <li key={size.id} className="admin-line">
              <span>{size.size} · {size.code} · {size.active ? "Active" : "Inactive"}</span>
              {role === "owner" && <form action={saveAdmin}>
                <input type="hidden" name="operation" value="sizeActive" /><input type="hidden" name="id" value={size.id} />
                <input type="hidden" name="active" value={String(!size.active)} />
                <Submit>{size.active ? "Deactivate" : "Activate"}</Submit>
              </form>}
            </li>)}</ul>
            {role === "owner" && <details className="admin-disclosure">
              <summary>Add an approved size</summary>
              <form action={saveAdmin} className="admin-form">
                <input type="hidden" name="operation" value="size" /><input type="hidden" name="id" value={variant.id} />
                <label>Size label <input name="size" maxLength={40} required /></label>
                <label>Unique SKU code <input name="code" maxLength={120} pattern="[A-Za-z0-9\-]+" required /></label>
                <Submit>Add size</Submit>
              </form>
            </details>}
          </article>;
        })}
      </div>
    </section>)}
  </AdminPage>;
}
