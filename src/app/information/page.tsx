import type { Metadata } from "next";
import { storeInformation } from "@/lib/store-information";
import { Status } from "@/components/status";
export const metadata: Metadata = {
  title: "Store information",
  robots: { index: false, follow: false },
};
export default function Information() {
  const approved = storeInformation.filter((item) => item.body);
  if (!approved.length)
    return (
      <Status
        title="Store information is awaiting approval."
        description="Approved contact and store policies will be available here before ordering opens."
      />
    );
  return (
    <article className="frame shop-page">
      <h1 className="shop-heading">Store information</h1>
      {approved.map((item) => (
        <section className="information-section" id={item.id} key={item.id}>
          <h2>{item.title}</h2>
          <p>{item.body}</p>
        </section>
      ))}
    </article>
  );
}
