import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const PROGRAM_ID = new PublicKey("GFzfEUfDjfC1jBg2ayrMryJFnxkb41FCabrWQimpPotV");
const MATCH_ID = "match_arsenal_chelsea_001";

async function main() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const walletPath = path.join(os.homedir(), ".config/solana/id.json");
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
  );

  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../target/idl/tei1.json"), "utf-8")
  );

  const provider = new AnchorProvider(connection, new anchor.Wallet(wallet), {
    commitment: "confirmed",
  });
  const program = new Program(idl, provider);

  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("market"), Buffer.from(MATCH_ID)],
    PROGRAM_ID
  );

  console.log("Market PDA:", marketPda.toBase58());

  const market: any = await (program.account as any).market.fetch(marketPda);

  console.log("\n── Market state ─────────────────────────");
  console.log("Home team:      ", market.homeTeam);
  console.log("Away team:      ", market.awayTeam);
  console.log("Status:         ", market.status);
  console.log("Outcome:        ", market.outcome);
  console.log("Kickoff:        ", new Date(market.kickoffTime.toNumber() * 1000).toLocaleString());
  console.log("Close:          ", new Date(market.closeTime.toNumber() * 1000).toLocaleString());
  console.log("Now:            ", new Date().toLocaleString());
  console.log("USDC mint:      ", market.usdcMint.toBase58());
  console.log("Vault:          ", market.vault.toBase58());
  console.log("YES liquidity:  ", market.yesLiquidity.toNumber() / 1_000_000, "USDC");
  console.log("NO liquidity:   ", market.noLiquidity.toNumber() / 1_000_000, "USDC");

  const vaultInfo = await connection.getAccountInfo(market.vault);
  console.log("\nVault account exists:", !!vaultInfo);
  if (vaultInfo) {
    console.log("Vault owner:    ", vaultInfo.owner.toBase58());
    console.log("Vault data len: ", vaultInfo.data.length);
  }

  try {
    const vaultBalance = await connection.getTokenAccountBalance(market.vault);
    console.log("Vault USDC bal: ", vaultBalance.value.uiAmount);
  } catch (e: any) {
    console.log("Vault balance fetch failed:", e.message);
  }
}

main().catch(console.error);