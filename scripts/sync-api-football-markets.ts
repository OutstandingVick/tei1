/**
 * Sync real API-Football fixtures into Tei devnet markets.
 *
 * Safe preview:
 *   npx ts-node scripts/sync-api-football-markets.ts --dry-run
 *
 * Create missing markets:
 *   npx ts-node scripts/sync-api-football-markets.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const PROGRAM_ID = new PublicKey("GFzfEUfDjfC1jBg2ayrMryJFnxkb41FCabrWQimpPotV");
const DEVNET_RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";
const IDL_PATH = path.join(__dirname, "../target/idl/tei1.json");
const CONFIG_PATH = path.join(__dirname, "devnet-config.json");
const WALLET_PATH = path.join(os.homedir(), ".config/solana/id.json");

type ApiFixture = {
  fixture: {
    id: number;
    date: string;
    timestamp: number;
    status: { short: string };
  };
  league: { id: number; name: string };
  teams: {
    home: { name: string };
    away: { name: string };
  };
};

type ApiResponse = {
  response?: ApiFixture[];
  errors?: unknown;
};

type DevnetConfig = {
  usdcMint: string;
  walletUsdcAta: string;
  markets?: Array<{ matchId: string; marketPda: string }>;
};

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadEnv() {
  loadEnvFile(path.join(__dirname, "../.env.local"));
  loadEnvFile(path.join(__dirname, "../.env"));
  loadEnvFile(path.join(__dirname, "../app/.env.local"));
}

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
  return PublicKey.findProgramAddressSync([Buffer.from("platform")], PROGRAM_ID);
}

function dateString(offsetDays: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function truncate(input: string, max: number) {
  return input.length > max ? input.slice(0, max - 1).trimEnd() : input;
}

function isTradableFixture(fixture: ApiFixture) {
  return !["FT", "AET", "PEN", "CANC", "PST", "ABD", "AWD", "WO"].includes(
    fixture.fixture.status.short
  );
}

function marketIdForFixture(fixtureId: number) {
  return `af_${fixtureId}`;
}

async function fetchFixtures() {
  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) throw new Error("Missing API_FOOTBALL_KEY. Add it to .env.local first.");

  const leagues = (process.env.API_FOOTBALL_LEAGUES || "39,140,135,2")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const season = process.env.API_FOOTBALL_SEASON || String(new Date().getUTCFullYear());
  const daysAhead = Math.min(Number(process.env.API_FOOTBALL_DAYS_AHEAD || 7), 14);
  const dates = Array.from({ length: daysAhead }, (_, i) => dateString(i));

  const groups = await Promise.all(
    leagues.flatMap((league) =>
      dates.map(async (date) => {
        const params = new URLSearchParams({
          league,
          season,
          date,
          timezone: "Africa/Lagos",
        });
        const res = await fetch(`${API_FOOTBALL_BASE}/fixtures?${params.toString()}`, {
          headers: { "x-apisports-key": apiKey },
        });
        if (!res.ok) {
          throw new Error(`API-Football ${res.status} for league ${league} on ${date}`);
        }
        const body = (await res.json()) as ApiResponse;
        if (body.errors && Object.keys(body.errors as Record<string, unknown>).length > 0) {
          throw new Error(`API-Football errors: ${JSON.stringify(body.errors)}`);
        }
        return body.response ?? [];
      })
    )
  );

  return groups
    .flat()
    .filter(isTradableFixture)
    .sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);
}

async function main() {
  loadEnv();

  const dryRun = process.argv.includes("--dry-run");
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as DevnetConfig;
  const usdcMint = new PublicKey(config.usdcMint);
  const walletUsdcAta = new PublicKey(config.walletUsdcAta);
  const seedUsdc = Number(process.env.MARKET_SEED_USDC || 100);
  const seedLamports = Math.floor(seedUsdc * 1_000_000);

  const fixtures = await fetchFixtures();
  console.log(`Fetched ${fixtures.length} tradable fixtures from API-Football.`);
  if (fixtures.length === 0) {
    console.log("No upcoming/live fixtures found for the configured leagues and date window.");
    return;
  }

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const wallet = loadWallet();
  const walletPubkey = wallet.publicKey;
  const balance = await connection.getBalance(walletPubkey);
  console.log(`Wallet: ${walletPubkey.toBase58()}`);
  console.log(`SOL balance: ${(balance / LAMPORTS_PER_SOL).toFixed(3)}`);

  if (!dryRun && balance < 0.1 * LAMPORTS_PER_SOL) {
    throw new Error("Need at least 0.1 SOL to create markets. Fund the wallet on devnet first.");
  }

  const provider = new AnchorProvider(connection, new anchor.Wallet(wallet), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf-8"));
  const program = new Program(idl, provider);
  const [platformPda] = getPlatformPda();
  const savedMarkets = new Map((config.markets ?? []).map((m) => [m.matchId, m.marketPda]));

  for (const fixture of fixtures) {
    const matchId = marketIdForFixture(fixture.fixture.id);
    const [marketPda] = getMarketPda(matchId);
    const home = truncate(fixture.teams.home.name, 32);
    const away = truncate(fixture.teams.away.name, 32);
    const title = truncate(`${home} vs ${away}`, 64);
    const kickoff = fixture.fixture.timestamp;
    const now = Math.floor(Date.now() / 1000);
    const close = Math.max(kickoff + 2 * 60 * 60, now + 30 * 60);

    const existing = await connection.getAccountInfo(marketPda);
    if (existing) {
      console.log(`Skip existing: ${matchId} ${title}`);
      savedMarkets.set(matchId, marketPda.toBase58());
      continue;
    }

    console.log(`${dryRun ? "Would create" : "Creating"}: ${matchId} ${title}`);
    console.log(`  League ${fixture.league.name}, kickoff ${fixture.fixture.date}`);

    if (dryRun) continue;

    const vaultPda = await getAssociatedTokenAddress(usdcMint, marketPda, true);

    await (program.methods as any)
      .createMarket(
        matchId,
        home,
        away,
        title,
        { matchWinner: {} },
        new BN(kickoff),
        new BN(close)
      )
      .accounts({
        market: marketPda,
        platform: platformPda,
        usdcMint,
        vault: vaultPda,
        authority: walletPubkey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await createAssociatedTokenAccount(
      connection,
      wallet,
      usdcMint,
      marketPda,
      undefined,
      undefined,
      undefined,
      true
    ).catch(() => undefined);

    await (program.methods as any)
      .seedLiquidity(new BN(seedLamports), new BN(seedLamports))
      .accounts({
        market: marketPda,
        vault: vaultPda,
        seederUsdc: walletUsdcAta,
        seeder: walletPubkey,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    savedMarkets.set(matchId, marketPda.toBase58());
    console.log(`  Seeded ${seedUsdc} YES / ${seedUsdc} NO USDC liquidity.`);
  }

  if (!dryRun) {
    const nextConfig: DevnetConfig = {
      ...config,
      markets: Array.from(savedMarkets.entries()).map(([matchId, marketPda]) => ({
        matchId,
        marketPda,
      })),
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(nextConfig, null, 2));
    console.log(`Updated ${CONFIG_PATH}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
