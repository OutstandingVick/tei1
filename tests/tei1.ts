import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Tei1 } from "../target/types/tei1";
import {
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";

describe("tei1", () => {
  const provider = process.env.ANCHOR_PROVIDER_URL
    ? anchor.AnchorProvider.env()
    : anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const program = anchor.workspace.Tei1 as Program<Tei1>;
  const authority = provider.wallet as anchor.Wallet;

  let usdcMint: anchor.web3.PublicKey;
  let authorityUsdc: anchor.web3.PublicKey;
  let treasuryUsdc: anchor.web3.PublicKey;
  let marketPda: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;
  let platformPda: anchor.web3.PublicKey;

  const matchId = "test_match_001";
  const user = anchor.web3.Keypair.generate();

  before(async () => {
    // Airdrop SOL to user
    const sig = await provider.connection.requestAirdrop(
      user.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);

    // Create mock USDC mint (6 decimals)
    usdcMint = await createMint(
      provider.connection,
      (authority.payer as anchor.web3.Keypair),
      authority.publicKey,
      null,
      6
    );

    // Create token accounts
    authorityUsdc = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer as anchor.web3.Keypair,
        usdcMint,
        authority.publicKey
      )
    ).address;

    treasuryUsdc = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer as anchor.web3.Keypair,
        usdcMint,
        authority.publicKey
      )
    ).address;

    // Create token accounts
    /*
     * Use associated token accounts in tests to avoid owner validation
     * edge cases in newer SPL helper versions.
     */

    // Mint 10,000 USDC to authority
    await mintTo(
      provider.connection,
      (authority.payer as anchor.web3.Keypair),
      usdcMint,
      authorityUsdc,
      authority.publicKey,
      10_000 * 1_000_000 // 10,000 USDC
    );

    // Derive PDAs
    [platformPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("platform")],
      program.programId
    );

    [marketPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("market"), Buffer.from(matchId)],
      program.programId
    );
  });

  it("Initializes the platform", async () => {
    await program.methods
      .initializePlatform()
      .accounts({
        platform: platformPda,
        treasury: treasuryUsdc,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const platform = await program.account.platform.fetch(platformPda);
    assert.equal(platform.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(platform.totalMarkets.toNumber(), 0);
    console.log("✅ Platform initialized");
  });

  it("Creates a match winner market", async () => {
    const now = Math.floor(Date.now() / 1000);
    const kickoff = now + 3600; // 1 hour from now
    const closeTime = kickoff + 6300; // 105 minutes after kickoff

    vaultPda = getAssociatedTokenAddressSync(usdcMint, marketPda, true);

    await program.methods
      .createMarket(
        matchId,
        "Arsenal",
        "Chelsea",
        "Arsenal vs Chelsea — Match Winner",
        { matchWinner: {} },
        new anchor.BN(kickoff),
        new anchor.BN(closeTime)
      )
      .accounts({
        market: marketPda,
        platform: platformPda,
        usdcMint: usdcMint,
        vault: vaultPda,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const market = await program.account.market.fetch(marketPda);
    assert.equal(market.homeTeam, "Arsenal");
    assert.equal(market.awayTeam, "Chelsea");
    assert.deepEqual(market.status, { open: {} });
    assert.deepEqual(market.outcome, { undecided: {} });

    const platform = await program.account.platform.fetch(platformPda);
    assert.equal(platform.totalMarkets.toNumber(), 1);

    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority.payer as anchor.web3.Keypair,
      usdcMint,
      marketPda,
      true
    );

    console.log("✅ Market created:", market.title);
  });

  it("Seeds initial liquidity (50/50)", async () => {
    const yesAmount = 1000 * 1_000_000; // 1000 USDC
    const noAmount = 1000 * 1_000_000;  // 1000 USDC

    await program.methods
      .seedLiquidity(new anchor.BN(yesAmount), new anchor.BN(noAmount))
      .accounts({
        market: marketPda,
        vault: vaultPda,
        seederUsdc: authorityUsdc,
        seeder: authority.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .rpc();

    const market = await program.account.market.fetch(marketPda);
    assert.equal(market.yesLiquidity.toNumber(), yesAmount);
    assert.equal(market.noLiquidity.toNumber(), noAmount);

    console.log("✅ Liquidity seeded: 1000 USDC each side");
  });

  it("User buys YES shares (Arsenal wins)", async () => {
    // Give user USDC first
    const userUsdc = (
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        authority.payer as anchor.web3.Keypair,
        usdcMint,
        user.publicKey
      )
    ).address;

    await mintTo(
      provider.connection,
      (authority.payer as anchor.web3.Keypair),
      usdcMint,
      userUsdc,
      authority.publicKey,
      500 * 1_000_000 // 500 USDC
    );

    const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("position"), marketPda.toBytes(), user.publicKey.toBytes()],
      program.programId
    );

    const usdcIn = 100 * 1_000_000; // 100 USDC
    const minSharesOut = 1; // accept any amount for test

    await program.methods
      .buyShares({ yes: {} }, new anchor.BN(usdcIn), new anchor.BN(minSharesOut))
      .accounts({
        market: marketPda,
        position: positionPda,
        vault: vaultPda,
        userUsdc: userUsdc,
        user: user.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const position = await program.account.position.fetch(positionPda);
    const market = await program.account.market.fetch(marketPda);

    assert.isTrue(position.yesShares.toNumber() > 0);
    assert.equal(position.totalSpent.toNumber(), usdcIn);

    // AMM pricing: at 50/50 liquidity, 100 USDC in should give ~91 shares
    // (1000 * 100) / (1000 + 100) = 90.9 shares
    console.log("✅ YES shares bought:", position.yesShares.toNumber() / 1_000_000);
    console.log("   Market YES liquidity remaining:", market.yesLiquidity.toNumber() / 1_000_000);
    console.log("   Implied YES price:", market.noLiquidity.toNumber() / (market.yesLiquidity.toNumber() + market.noLiquidity.toNumber()));
  });

  it("Admin resolves market — Arsenal wins (HomeWin)", async () => {
    await program.methods
      .resolveMarket({ homeWin: {} })
      .accounts({
        market: marketPda,
        authority: authority.publicKey,
      })
      .rpc();

    const market = await program.account.market.fetch(marketPda);
    assert.deepEqual(market.status, { resolved: {} });
    assert.deepEqual(market.outcome, { homeWin: {} });
    console.log("✅ Market resolved: Arsenal wins");
  });

  it("User claims winnings", async () => {
    const [positionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("position"), marketPda.toBytes(), user.publicKey.toBytes()],
      program.programId
    );

    // Get user USDC account
    const userAccounts = await provider.connection.getTokenAccountsByOwner(
      user.publicKey,
      { mint: usdcMint }
    );
    const userUsdc = userAccounts.value[0].pubkey;

    const beforeBalance = (await getAccount(provider.connection, userUsdc)).amount;

    await program.methods
      .claimWinnings()
      .accounts({
        market: marketPda,
        position: positionPda,
        vault: vaultPda,
        userUsdc: userUsdc,
        treasury: treasuryUsdc,
        user: user.publicKey,
        tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const afterBalance = (await getAccount(provider.connection, userUsdc)).amount;
    const payout = Number(afterBalance - beforeBalance) / 1_000_000;

    const position = await program.account.position.fetch(positionPda);
    assert.isTrue(position.claimed);
    assert.isTrue(payout > 0);

    console.log("✅ Winnings claimed:", payout.toFixed(2), "USDC");
    console.log("   Spent: 100 USDC → Received:", payout.toFixed(2), "USDC");
  });
});
