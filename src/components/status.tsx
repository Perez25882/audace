import Link from "next/link";

type StatusProps = {
  title: string;
  description: string;
  label?: string;
  children?: React.ReactNode;
};

export function Status({ title, description, label, children }: StatusProps) {
  return (
    <section className="frame status">
      {label && <p className="kicker">{label}</p>}
      <h1>{title}</h1>
      <p className="status-description">{description}</p>
      {children}
      <Link className="button button-outline" href="/#collection">Explore the collection</Link>
    </section>
  );
}
