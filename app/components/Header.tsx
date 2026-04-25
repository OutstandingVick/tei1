"use client";

import { ClientWalletMultiButton } from "@/components/ClientWalletMultiButton";
import Link from "next/link";

export function Header() {
  return (
    <header className="tei-header">
      <Link href="/" className="tei-logo">
        <span className="tei-logo-mark">⬡</span>
        <span className="tei-logo-text">Tei</span>
        <span className="tei-logo-tag">DEVNET</span>
      </Link>

      <nav className="tei-nav">
        <Link href="/" className="tei-nav-link">Markets</Link>
        <Link href="/portfolio" className="tei-nav-link">Portfolio</Link>
      </nav>

      <div className="tei-header-right">
        <ClientWalletMultiButton className="tei-wallet-btn" />
      </div>
    </header>
  );
}
