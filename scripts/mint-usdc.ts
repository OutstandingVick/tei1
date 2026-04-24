/**
 * Mint test USDC to a specific wallet address on devnet
 *
 * Usage (from tei1/ project root):
 *   npx ts-node scripts/mint-usdc.ts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ── Config ────────────────────────────────────────────────
const DEVNET_RPC = "https://api.devnet.solana.com";
const WALLET_PATH = path.join(os.homedir(), ".config/solana/id.json");

// Your Phantom wallet address
const RECIPIENT = new PublicKey("4CtohmVcGLgpHTZYL68QrVhs3DjX3ESqA44rVrcyPvQT");

// Mock USDC mint created by seed-devnet.ts
const USDC_MINT = new PublicKey("9UCkswA3eMayys4Uk1a7KSFEYWZVG2UnMcANQwLVR7ZN");
// Amount to mint
const AMOUNT_USDC = 1000;

async function main() {
  console.log("💰 Minting test USDC to Phantom\n");

  const connection = new Connection(DEVNET_RPC, "confirmed");

  // Load mint authority (the CLI wallet that created the mint)
  const raw = fs.readFileSync(WALLET_PATH, "utf-8");
  const mintAuthority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));

  console.log("Mint authority:", mintAuthority.publicKey.toBase58());
  console.log("Recipient:", RECIPIENT.toBase58());
  console.log("USDC mint:", USDC_MINT.toBase58());
  console.log(`Amount: ${AMOUNT_USDC} USDC\n`);

  // Get or create the recipient's USDC associated token account
  console.log("1️⃣  Ensuring recipient has USDC account...");
  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection,
    mintAuthority, // payer
    USDC_MINT,
    RECIPIENT
  );
  console.log("   ✅ ATA:", recipientAta.address.toBase58());

  // Mint USDC
  console.log("\n2️⃣  Minting USDC...");
  const sig = await mintTo(
    connection,
    mintAuthority, // payer
    USDC_MINT,
    recipientAta.address,
    mintAuthority.publicKey, // mint authority
    AMOUNT_USDC * 1_000_000 // USDC uses 6 decimals
  );
  console.log("   ✅ Minted:", sig);
  console.log(`   Explorer: https://explorer.solana.com/tx/${sig}?cluster=devnet`);

  console.log(`\n✨ Done! Your Phantom wallet now has ${AMOUNT_USDC} test USDC.`);
  console.log("You can now place real trades on Tei!\n");
}

main().catch((e) => {
  console.error("❌ Mint failed:", e);
  process.exit(1);
});