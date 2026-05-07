import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { clusterApiUrl } from "@solana/web3.js";

export const SOLANA_NETWORK =
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK as WalletAdapterNetwork | undefined) ??
  WalletAdapterNetwork.Devnet;

export const SOLANA_RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK);

export const SOLANA_WS_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_WS_URL || undefined;

export const SOLANA_WS_ENABLED =
  process.env.NEXT_PUBLIC_SOLANA_WS_ENABLED !== "false" &&
  Boolean(SOLANA_WS_ENDPOINT);

export const SOLANA_RPC_PROVIDER =
  process.env.NEXT_PUBLIC_SOLANA_RPC_PROVIDER || "Public RPC";

export const IS_QUICKNODE_RPC =
  SOLANA_RPC_PROVIDER.toLowerCase().includes("quicknode") ||
  SOLANA_RPC_ENDPOINT.toLowerCase().includes("quiknode") ||
  SOLANA_RPC_ENDPOINT.toLowerCase().includes("quicknode");
