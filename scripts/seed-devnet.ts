/**
 * Seed devnet with markets + mock USDC
 *
 * Usage (from tei1/ project root):
 *   npx ts-node scripts/seed-devnet.ts
 *
 * What it does:
 * 1. Creates a mock USDC mint on devnet (since real USDC is hard to get)
 * 2. Mints 10,000 test USDC to your wallet
 * 3. Initializes the Tei platform
 * 4. Creates markets for each mock match
 * 5. Seeds liquidity based on each market's target probability
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAccount,
  mintTo,
  getAssociatedTokenAddress,
  createAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ── Config ────────────────────────────────────────────────
const PROGRAM_ID = new PublicKey("GFzfEUfDjfC1jBg2ayrMryJFnxkb41FCabrWQimpPotV");
const DEVNET_RPC = "https://api.devnet.solana.com";
const IDL_PATH = path.join(__dirname, "../target/idl/tei1.json");
const WALLET_PATH = path.join(os.homedir(), ".config/solana/id.json");

// Match data — mirrors lib/matches.ts
const MATCHES = [
  { matchId: "match_arsenal_chelsea_v2", home: "Arsenal", away: "Chelsea", title: "Arsenal vs Chelsea", yesProb: 0.62 },
  { matchId: "match_barca_madrid_v2", home: "Barcelona", away: "Real Madrid", title: "Barcelona vs Real Madrid", yesProb: 0.48 },
  { matchId: "match_psg_dortmund_v2", home: "PSG", away: "Dortmund", title: "PSG vs Dortmund", yesProb: 0.55 },
  { matchId: "match_city_liverpool_v2", home: "Man City", away: "Liverpool", title: "Man City vs Liverpool", yesProb: 0.44 },
  { matchId: "match_inter_juventus_v2", home: "Inter Milan", away: "Juventus", title: "Inter vs Juventus", yesProb: 0.33 },
];

// ── Helpers ───────────────────────────────────────────────
function loadWallet(): Keypair {
  const raw = fs.readFileSync(WALLET_PATH, "utf-8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

function getMarketPda(matchId: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(matchId)],
    PROGRAM_ID
  );
}

function getPlatformPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("platform")],
    PROGRAM_ID
  );
}

// ── Main ─────────────────────────────────────────────────
async function main() {
  console.log("🌱 Tei devnet seeder\n");

  // Setup
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const wallet = loadWallet();
  const walletPubkey = wallet.publicKey;

  console.log("Wallet:", walletPubkey.toBase58());
  const bal = await connection.getBalance(walletPubkey);
  console.log("Balance:", (bal / LAMPORTS_PER_SOL).toFixed(3), "SOL\n");

  if (bal < 0.5 * LAMPORTS_PER_SOL) {
    console.error("❌ Need at least 0.5 SOL. Run: solana airdrop 2");
    process.exit(1);
  }

  // Load IDL + setup Anchor
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const provider = new AnchorProvider(
    connection,
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  anchor.setProvider(provider);
  const program = new Program(idl, provider);

  // ─── 1. Create mock USDC mint ─────────────────────────
  console.log("1️⃣  Creating mock USDC mint...");
  const usdcMint = await createMint(
    connection,
    wallet,
    walletPubkey, // mint authority
    null,
    6 // USDC decimals
  );
  console.log("   ✅ USDC mint:", usdcMint.toBase58());

  // Wallet's USDC ATA
  const walletUsdcAta = await createAssociatedTokenAccount(
    connection,
    wallet,
    usdcMint,
    walletPubkey
  );

  // Mint 50,000 USDC to wallet (for seeding + trading)
  await mintTo(
    connection,
    wallet,
    usdcMint,
    walletUsdcAta,
    walletPubkey,
    50_000 * 1_000_000
  );
  console.log("   ✅ Minted 50,000 test USDC to your wallet\n");

  // ─── 2. Initialize platform ───────────────────────────
  console.log("2️⃣  Initializing platform...");
  const [platformPda] = getPlatformPda();

  // Treasury = wallet's USDC ATA (fees go here)
  const treasury = walletUsdcAta;

  try {
    const existing = await connection.getAccountInfo(platformPda);
    if (existing) {
      console.log("   ⏭  Platform already initialized, skipping");
    } else {
      await program.methods
        .initializePlatform()
        .accounts({
          platform: platformPda,
          treasury,
          authority: walletPubkey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("   ✅ Platform initialized:", platformPda.toBase58());
    }
  } catch (e: any) {
    console.error("   ❌ Platform init failed:", e.message);
  }
  console.log();

  // ─── 3. Create markets + seed liquidity ───────────────
  console.log("3️⃣  Creating markets + seeding liquidity...\n");

  for (const m of MATCHES) {
    console.log(`📍 ${m.home} vs ${m.away}`);
    const [marketPda] = getMarketPda(m.matchId);

    // Skip if exists
    const existing = await connection.getAccountInfo(marketPda);
    if (existing) {
      console.log(`   ⏭  Market exists, skipping creation\n`);
      continue;
    }

    // Create vault as associated token account owned by market PDA
    const vaultPda = await getAssociatedTokenAddress(
      usdcMint,
      marketPda,
      true // allowOwnerOffCurve = true for PDA
    );

    // Kickoff time — stagger from 30min to 5h from now
    const now = Math.floor(Date.now() / 1000);
    const kickoff = now + 30 * 60;
const close = now + 30 * 24 * 60 * 60; // close 30 days from now — won't expire during hackathon

    try {
      // Create market
      await program.methods
        .createMarket(
          m.matchId,
          m.home,
          m.away,
          m.title,
          { matchWinner: {} },
          new BN(kickoff),
          new BN(close)
        )
        .accounts({
          market: marketPda,
          platform: platformPda,
          usdcMint: usdcMint,
          vault: vaultPda,
          authority: walletPubkey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log(`   ✅ Market created`);

      // Create vault as ATA (market PDA is owner)
      await createAssociatedTokenAccount(
        connection,
        wallet,
        usdcMint,
        marketPda,
        undefined,
        undefined,
        undefined,
        true // allowOwnerOffCurve
      ).catch(() => {}); // ignore if exists

      // Seed liquidity to match the target probability
      // High YES prob → less YES liquidity (scarcer = more expensive)
      // yesLiq and noLiq should be inversely proportional to the probability
      const totalLiq = 2000; // 2000 USDC total per market
      const yesLiq = Math.floor(totalLiq * (1 - m.yesProb) * 1_000_000);
      const noLiq = Math.floor(totalLiq * m.yesProb * 1_000_000);

      await program.methods
        .seedLiquidity(new BN(yesLiq), new BN(noLiq))
        .accounts({
          market: marketPda,
          vault: vaultPda,
          seederUsdc: walletUsdcAta,
          seeder: walletPubkey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      console.log(
        `   ✅ Seeded ${(yesLiq / 1_000_000).toFixed(0)} YES / ${(noLiq / 1_000_000).toFixed(0)} NO (implied ${(m.yesProb * 100).toFixed(0)}% ${m.home})\n`
      );
    } catch (e: any) {
      console.error(`   ❌ Failed:`, e.message, "\n");
    }
  }

  // ─── 4. Output config for frontend ───────────────────
  console.log("\n✨ Seeding complete!\n");
  console.log("═══════════════════════════════════════════════════════");
  console.log("Update lib/program.ts USDC_MINT with:");
  console.log(`  "${usdcMint.toBase58()}"`);
  console.log("═══════════════════════════════════════════════════════\n");

  // Save to file for easy reference
  const config = {
    programId: PROGRAM_ID.toBase58(),
    usdcMint: usdcMint.toBase58(),
    platformPda: platformPda.toBase58(),
    walletUsdcAta: walletUsdcAta.toBase58(),
    markets: MATCHES.map((m) => ({
      matchId: m.matchId,
      marketPda: getMarketPda(m.matchId)[0].toBase58(),
    })),
  };

  fs.writeFileSync(
    path.join(__dirname, "devnet-config.json"),
    JSON.stringify(config, null, 2)
  );
  console.log("💾 Config saved to scripts/devnet-config.json\n");
}

main().catch((e) => {
  console.error("❌ Seed script failed:", e);
  process.exit(1);
});