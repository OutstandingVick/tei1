import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, BN, Program, web3 } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const PROGRAM_ID = new PublicKey(
  "GFzfEUfDjfC1jBg2ayrMryJFnxkb41FCabrWQimpPotV"
);

// Devnet USDC mint (Circle's official devnet USDC)
export const USDC_MINT = new PublicKey(
  "9UCkswA3eMayys4Uk1a7KSFEYWZVG2UnMcANQwLVR7ZN"
);

export function getPlatformPda() {
  return PublicKey.findProgramAddressSync([Buffer.from("platform")], PROGRAM_ID);
}

export function getMarketPda(matchId: string) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(matchId)],
    PROGRAM_ID
  );
}

export function getPositionPda(marketPubkey: PublicKey, userPubkey: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), marketPubkey.toBytes(), userPubkey.toBytes()],
    PROGRAM_ID
  );
}

export function getVaultPda(marketPubkey: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), marketPubkey.toBytes()],
    PROGRAM_ID
  );
}

// Calculate AMM price after a trade
// Returns shares you'd receive for usdcIn on a given side
export function calculateSharesOut(
  usdcIn: number,
  yesLiquidity: number,
  noLiquidity: number,
  side: "yes" | "no"
): number {
  if (side === "yes") {
    return (yesLiquidity * usdcIn) / (noLiquidity + usdcIn);
  } else {
    return (noLiquidity * usdcIn) / (yesLiquidity + usdcIn);
  }
}

// Implied probability from AMM state
export function impliedProbability(
  yesLiquidity: number,
  noLiquidity: number
): { yes: number; no: number } {
  const total = yesLiquidity + noLiquidity;
  return {
    yes: noLiquidity / total,  // counterintuitive: low YES liq = high YES price
    no: yesLiquidity / total,
  };
}

export function formatUsdc(lamports: number): string {
  return (lamports / 1_000_000).toFixed(2);
}

export function usdcToLamports(usdc: number): number {
  return Math.floor(usdc * 1_000_000);
}