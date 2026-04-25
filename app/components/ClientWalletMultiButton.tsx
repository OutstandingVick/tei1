"use client";

import dynamic from "next/dynamic";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

type WalletMultiButtonProps = React.ComponentProps<typeof WalletMultiButton>;

const WalletMultiButtonNoSSR = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  {
    ssr: false,
    loading: () => (
      <button type="button" disabled aria-hidden="true">
        Select Wallet
      </button>
    ),
  }
);

export function ClientWalletMultiButton(props: WalletMultiButtonProps) {
  return <WalletMultiButtonNoSSR {...props} />;
}
