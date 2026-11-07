import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";
import "./globals.css";
import { Footer, Header } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: { default: "AUDACE | The First Release", template: "%s | AUDACE" },
  description: "Explore the first release from AUDACE, a Ghanaian premium menswear brand.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-ivory text-espresso">
        <a className="skip-link" href="#main-content">Skip to content</a>
        <Header />
        <main className="grow" id="main-content" tabIndex={-1}>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
