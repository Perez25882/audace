import Link from "next/link";
import { Arrow, BagIcon } from "./icons";

export function Header() {
  return (
    <header className="site-header">
      <nav className="frame header-grid" aria-label="Primary">
        <Link className="header-link" href="/#collection">Collection</Link>
        <Link className="wordmark" href="/" aria-label="AUDACE home">AUDACE</Link>
        <Link className="header-link bag-link" href="/bag">
          <BagIcon /> <span>Bag</span>
        </Link>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="frame">
        <div className="footer-main">
          <div>
            <Link className="wordmark footer-wordmark" href="/" aria-label="AUDACE home">AUDACE</Link>
            <p className="footer-philosophy">Presence Without Announcement.</p>
          </div>
          <nav className="footer-nav" aria-label="Footer">
            <Link href="/#collection">Collection <Arrow direction="up-right" /></Link>
            <Link href="/bag">Bag <Arrow direction="up-right" /></Link>
          </nav>
        </div>
        <p className="footer-base">AUDACE <span aria-hidden="true">/</span> Ghana</p>
      </div>
    </footer>
  );
}
