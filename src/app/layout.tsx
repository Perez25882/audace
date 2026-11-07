import type { Metadata } from "next";
import { connection } from "next/server";
import { publicSite } from "@/lib/release";
import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";
import "./globals.css";
import { Footer, Header } from "@/components/site-chrome";

export function generateMetadata(): Metadata {
  const site = publicSite(process.env);
  return {
    title: { default: "AUDACE | The First Release", template: "%s | AUDACE" },
    description:
      "Explore the first release from AUDACE, a Ghanaian premium menswear brand.",
    robots: { index: site.index, follow: site.index },
    ...(site.origin ? { metadataBase: new URL(site.origin) } : {}),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await connection();
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-ivory text-espresso">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <Header />
        <main className="grow" id="main-content" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
