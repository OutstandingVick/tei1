"use client";

import { FC, ReactNode, useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  SOLANA_RPC_ENDPOINT,
  SOLANA_WS_ENABLED,
  SOLANA_WS_ENDPOINT,
} from "@/lib/solanaRpc";


export const AppWalletProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const endpoint = useMemo(() => SOLANA_RPC_ENDPOINT, []);
  const config = useMemo(
    () => ({
      commitment: "confirmed" as const,
      wsEndpoint: SOLANA_WS_ENABLED ? SOLANA_WS_ENDPOINT : undefined,
    }),
    []
  );
  // Wallet Standard injects Phantom and other compatible wallets automatically.
  // Keeping explicit Phantom adapter causes duplicate registration warnings.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint} config={config}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};
