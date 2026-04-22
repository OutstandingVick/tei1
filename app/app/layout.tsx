import type { Metadata } from "next";
import { AppWalletProvider } from "@/components/WalletProvider";
import { Header } from "@/components/Header";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";

export const metadata: Metadata = {
  title: "Tei — Live Football Prediction Markets",
  description:
    "Trade football match outcomes peer-to-peer. AMM-powered pricing, instant Solana settlement.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AppWalletProvider>
          <Header />
          <main className="tei-main">{children}</main>
        </AppWalletProvider>
      </body>
    </html>
  );
}