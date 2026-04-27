"use client";

import { useState, useCallback, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, BN, Idl } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { ClientWalletMultiButton } from "@/components/ClientWalletMultiButton";
import { Match } from "@/lib/matches";
import {
  calculateSharesOut,
  USDC_MINT,
  getMarketPda,
  getPlatformPda,
  getPositionPda,
} from "@/lib/program";
import IDL from "@/lib/idl.json";

type Side = "yes" | "no";

type UserPosition = {
  yesShares: number;
  noShares: number;
  totalSpent: number;
  claimed: boolean;
};

type MarketOutcome = "home_win" | "away_win" | "draw" | "undecided";

function formatOutcome(outcome: MarketOutcome) {
  if (outcome === "home_win") return "Home Win";
  if (outcome === "away_win") return "Away Win";
  if (outcome === "draw") return "Draw";
  return "Undecided";
}

export function TradePanel({ match }: { match: Match }) {
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [side, setSide] = useState<Side>("yes");
  const [amount, setAmount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [marketResolved, setMarketResolved] = useState(false);
  const [marketOutcome, setMarketOutcome] = useState<MarketOutcome>("undecided");
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimSig, setClaimSig] = useState<string | null>(null);

  // ── Fetch user position + balance ──
  const fetchPositionAndBalance = useCallback(async () => {
    if (!publicKey) return;

    try {
      const provider = new AnchorProvider(
        connection,
        { publicKey, signTransaction: async (t) => t, signAllTransactions: async (t) => t },
        { commitment: "confirmed" }
      );
      const program = new Program(IDL as Idl, provider);

      const [marketPda] = getMarketPda(match.matchId);
      const [positionPda] = getPositionPda(marketPda, publicKey);

      // Fetch position
      try {
        const pos: any = await (program.account as any).position.fetch(positionPda);
        setPosition({
          yesShares: pos.yesShares.toNumber() / 1_000_000,
          noShares: pos.noShares.toNumber() / 1_000_000,
          totalSpent: pos.totalSpent.toNumber() / 1_000_000,
          claimed: pos.claimed,
        });
      } catch {
        setPosition(null); // no position yet
      }

      // Fetch market status
      try {
        const market: any = await (program.account as any).market.fetch(marketPda);
        const statusKey = Object.keys(market.status ?? {})[0];
        const outcomeKey = Object.keys(market.outcome ?? {})[0];
        setMarketResolved(statusKey === "resolved");
        if (outcomeKey === "homeWin") setMarketOutcome("home_win");
        else if (outcomeKey === "awayWin") setMarketOutcome("away_win");
        else if (outcomeKey === "draw") setMarketOutcome("draw");
        else setMarketOutcome("undecided");
      } catch {
        setMarketResolved(false);
        setMarketOutcome("undecided");
      }

      // Fetch USDC balance
      try {
        const userUsdcAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);
        const bal = await connection.getTokenAccountBalance(userUsdcAta);
        setUsdcBalance(bal.value.uiAmount);
      } catch {
        setUsdcBalance(0);
      }
    } catch (e) {
      console.error("Fetch error:", e);
    }
  }, [publicKey, connection, match.matchId]);

  useEffect(() => {
    fetchPositionAndBalance();
  }, [fetchPositionAndBalance, txSig]);

  // AMM preview
  const yesLiq = 1000 * match.yesPrice * 2 * 1_000_000;
  const noLiq = 1000 * match.noPrice * 2 * 1_000_000;

  const usdcIn = parseFloat(amount) || 0;
  const sharesOut = usdcIn > 0
    ? calculateSharesOut(usdcIn * 1_000_000, yesLiq, noLiq, side) / 1_000_000
    : 0;
  const impliedOdds = usdcIn > 0 && sharesOut > 0
    ? (sharesOut / usdcIn).toFixed(2)
    : "—";
  const potentialProfit = sharesOut > 0 ? (sharesOut - usdcIn).toFixed(2) : "0.00";

  const QUICK_AMOUNTS = [10, 25, 50, 100];

  const handleTrade = useCallback(async () => {
    if (!connected || !publicKey || !signTransaction) return;
    if (!usdcIn || usdcIn <= 0) {
      setError("Enter an amount to trade");
      return;
    }

    setLoading(true);
    setError(null);
    setTxSig(null);
    setClaimSig(null);

    try {
      const provider = new AnchorProvider(
        connection,
        { publicKey, signTransaction, signAllTransactions: async (txs) => txs },
        { commitment: "confirmed" }
      );
      const program = new Program(IDL as Idl, provider);

      const [marketPda] = getMarketPda(match.matchId);
      const [positionPda] = getPositionPda(marketPda, publicKey);

      const userUsdcAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const tx = new Transaction();

      const ataInfo = await connection.getAccountInfo(userUsdcAta);
      if (!ataInfo) {
        tx.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            userUsdcAta,
            publicKey,
            USDC_MINT
          )
        );
      }

      let marketAccount: any;
      try {
        marketAccount = await (program.account as any).market.fetch(marketPda);
      } catch {
        throw new Error(`Market ${match.matchId} is not initialized on-chain yet. Seed/create this market first.`);
      }
      const vaultPubkey = marketAccount.vault as PublicKey;

      const [mintInfo, vaultInfo] = await Promise.all([
        connection.getAccountInfo(USDC_MINT),
        connection.getAccountInfo(vaultPubkey),
      ]);
      if (!mintInfo) {
        throw new Error("USDC mint account not found on this cluster.");
      }
      if (!vaultInfo) {
        throw new Error("Market vault account not found. Seed liquidity for this market first.");
      }

      const usdcLamports = new BN(Math.floor(usdcIn * 1_000_000));
      const minSharesOut = new BN(1);

      const sideArg = side === "yes" ? { yes: {} } : { no: {} };

      const buyIx = await (program.methods as any)
        .buyShares(sideArg, usdcLamports, minSharesOut)
        .accounts({
          market: marketPda,
          position: positionPda,
          vault: vaultPubkey,
          userUsdc: userUsdcAta,
          user: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: new PublicKey("11111111111111111111111111111111"),
        })
        .instruction();

      tx.add(buyIx);

      const { blockhash, lastValidBlockHeight } =
  await connection.getLatestBlockhash();
tx.recentBlockhash = blockhash;
tx.feePayer = publicKey;

      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) {
        const simLogs = sim.value.logs?.join("\n") ?? "No logs";
        throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}\n${simLogs}`);
      }

      const signedTx = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize(), {
        preflightCommitment: "confirmed",
        maxRetries: 3,
      });

      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      setTxSig(sig);
      setAmount("");
    } catch (e: any) {
      console.error("Trade error:", e);
      const message = `${e?.message ?? ""} ${e?.error?.message ?? ""}`;
      if (message.includes("AccountNotFound")) {
        setError("Required on-chain account is missing. Ensure market liquidity is seeded and your token accounts exist.");
      } else if (message.includes("insufficient funds")) {
        setError("Insufficient USDC balance.");
      } else if (message.includes("User rejected") || message.includes("rejected")) {
        setError("Transaction cancelled.");
      } else if (message.includes("MarketNotOpen")) {
        setError("This market is not open for trading yet.");
      } else if (message.includes("MarketClosed")) {
        setError("Trading window has closed.");
      } else {
        setError(e?.error?.message || e?.message || "Transaction failed. Check console.");
      }
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey, signTransaction, connection, usdcIn, side, match]);

  const handleClaim = useCallback(async () => {
    if (!connected || !publicKey || !signTransaction) return;

    setClaimLoading(true);
    setError(null);
    setTxSig(null);
    setClaimSig(null);

    try {
      const provider = new AnchorProvider(
        connection,
        { publicKey, signTransaction, signAllTransactions: async (txs) => txs },
        { commitment: "confirmed" }
      );
      const program = new Program(IDL as Idl, provider);
      const [marketPda] = getMarketPda(match.matchId);
      const [positionPda] = getPositionPda(marketPda, publicKey);
      const [platformPda] = getPlatformPda();

      const userUsdcAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const ataInfo = await connection.getAccountInfo(userUsdcAta);
      if (!ataInfo) {
        throw new Error("USDC token account not found. Buy shares first or mint test USDC.");
      }

      const marketAccount: any = await (program.account as any).market.fetch(marketPda);
      const platformAccount: any = await (program.account as any).platform.fetch(platformPda);
      const vaultPubkey = marketAccount.vault as PublicKey;
      const treasuryPubkey = platformAccount.treasury as PublicKey;

      const claimIx = await (program.methods as any)
        .claimWinnings()
        .accounts({
          market: marketPda,
          position: positionPda,
          vault: vaultPubkey,
          userUsdc: userUsdcAta,
          treasury: treasuryPubkey,
          user: publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      const tx = new Transaction().add(claimIx);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const sim = await connection.simulateTransaction(tx);
      if (sim.value.err) {
        const simLogs = sim.value.logs?.join("\n") ?? "No logs";
        throw new Error(`Claim simulation failed: ${JSON.stringify(sim.value.err)}\n${simLogs}`);
      }

      const signedTx = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signedTx.serialize(), {
        preflightCommitment: "confirmed",
        maxRetries: 3,
      });
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      setClaimSig(sig);
      fetchPositionAndBalance();
    } catch (e: any) {
      console.error("Claim error:", e);
      const message = `${e?.message ?? ""} ${e?.error?.message ?? ""}`;
      if (message.includes("MarketNotResolved")) {
        setError("Market is not resolved yet.");
      } else if (message.includes("AlreadyClaimed")) {
        setError("Winnings already claimed.");
      } else if (message.includes("NoWinningShares")) {
        setError("No winning shares to claim for this outcome.");
      } else if (message.includes("User rejected") || message.includes("rejected")) {
        setError("Transaction cancelled.");
      } else {
        setError(e?.error?.message || e?.message || "Claim failed.");
      }
    } finally {
      setClaimLoading(false);
    }
  }, [connected, publicKey, signTransaction, connection, match.matchId, fetchPositionAndBalance]);

  const selectedTeam = side === "yes" ? match.homeTeam : match.awayTeam;
  const selectedPrice = side === "yes" ? match.yesPrice : match.noPrice;

  // Potential payout if position wins
  const totalShares = position ? position.yesShares + position.noShares : 0;
  const hasPosition = position && totalShares > 0;
  const avgCost = hasPosition && totalShares > 0
    ? (position!.totalSpent / totalShares).toFixed(3)
    : "—";
  const canClaim = Boolean(hasPosition && marketResolved && !position!.claimed);

  return (
    <div className="trade-panel-wrap">
      {/* ─── Your Position Card ─────────── */}
      {hasPosition && (
        <div className="position-card">
          <div className="position-header">
            <span className="position-label">YOUR POSITION</span>
            <span className="position-spent">
              Spent ${position!.totalSpent.toFixed(2)}
            </span>
          </div>
          {marketResolved && (
            <div className="position-market-status">
              Resolved: {formatOutcome(marketOutcome)}
            </div>
          )}

          <div className="position-shares">
            {position!.yesShares > 0 && (
              <div className="position-row yes">
                <div className="position-side-label">
                  <span className="position-dot yes-dot" />
                  {match.homeTeam} (YES)
                </div>
                <div className="position-shares-val">
                  {position!.yesShares.toFixed(2)}
                  <span className="position-shares-unit"> shares</span>
                </div>
              </div>
            )}

            {position!.noShares > 0 && (
              <div className="position-row no">
                <div className="position-side-label">
                  <span className="position-dot no-dot" />
                  {match.awayTeam} (NO)
                </div>
                <div className="position-shares-val">
                  {position!.noShares.toFixed(2)}
                  <span className="position-shares-unit"> shares</span>
                </div>
              </div>
            )}
          </div>

          <div className="position-footer">
            <div className="position-stat">
              <span className="position-stat-label">Avg cost</span>
              <span className="position-stat-val">${avgCost}</span>
            </div>
            <div className="position-stat">
              <span className="position-stat-label">Max payout</span>
              <span className="position-stat-val green">
                ${(Math.max(position!.yesShares, position!.noShares)).toFixed(2)}
              </span>
            </div>
          </div>

          {position!.claimed && (
            <div className="trade-success">
              <span>✓ Winnings already claimed</span>
            </div>
          )}
          {canClaim && (
            <button
              className={`trade-btn yes ${claimLoading ? "loading" : ""}`}
              onClick={handleClaim}
              disabled={claimLoading}
            >
              {claimLoading ? (
                <span className="trade-btn-loading">
                  <span className="spinner" /> Claiming on-chain...
                </span>
              ) : (
                "Claim Winnings"
              )}
            </button>
          )}
          {claimSig && (
            <div className="trade-success">
              <span>✓ Claim confirmed on-chain</span>
              <a
                href={`https://explorer.solana.com/tx/${claimSig}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="tx-link"
              >
                View claim on Solana Explorer →
              </a>
            </div>
          )}
        </div>
      )}

      {/* ─── Trade Panel ─────────────────── */}
      <div className="trade-panel">
        <div className="trade-panel-header">
          <h2 className="trade-title">
            {hasPosition ? "Add to Position" : "Trade Outcome"}
          </h2>
          <span className="trade-market-type">Match Winner</span>
        </div>

        {/* Balance */}
        {connected && usdcBalance !== null && (
          <div className="balance-row">
            <span className="balance-label">Your USDC:</span>
            <span className="balance-val">${usdcBalance.toFixed(2)}</span>
          </div>
        )}

        {/* Side selector */}
        <div className="side-selector">
          <button
            className={`side-btn yes ${side === "yes" ? "active" : ""}`}
            onClick={() => { setSide("yes"); setTxSig(null); setError(null); }}
          >
            <span className="side-btn-team">{match.homeTeam}</span>
            <span className="side-btn-prob">
              {(match.yesPrice * 100).toFixed(0)}%
            </span>
          </button>
          <button
            className={`side-btn no ${side === "no" ? "active" : ""}`}
            onClick={() => { setSide("no"); setTxSig(null); setError(null); }}
          >
            <span className="side-btn-team">{match.awayTeam}</span>
            <span className="side-btn-prob">
              {(match.noPrice * 100).toFixed(0)}%
            </span>
          </button>
        </div>

        {/* Amount input */}
        <div className="amount-section">
          <label className="amount-label">Amount (USDC)</label>
          <div className="amount-input-wrap">
            <span className="amount-currency">$</span>
            <input
              type="number"
              className="amount-input"
              placeholder="0.00"
              value={amount}
              min="1"
              onChange={(e) => {
                setAmount(e.target.value);
                setTxSig(null);
                setError(null);
              }}
            />
          </div>
          <div className="quick-amounts">
            {QUICK_AMOUNTS.map((q) => (
              <button
                key={q}
                className={`quick-btn ${amount === String(q) ? "active" : ""}`}
                onClick={() => { setAmount(String(q)); setTxSig(null); }}
              >
                ${q}
              </button>
            ))}
          </div>
        </div>

        {/* Trade preview */}
        {usdcIn > 0 && (
          <div className="trade-preview">
            <div className="preview-row">
              <span>Shares out</span>
              <span className="preview-val">{sharesOut.toFixed(2)}</span>
            </div>
            <div className="preview-row">
              <span>Implied odds</span>
              <span className="preview-val">{impliedOdds}x</span>
            </div>
            <div className="preview-row">
              <span>Potential profit</span>
              <span className={`preview-val ${parseFloat(potentialProfit) > 0 ? "positive" : ""}`}>
                +${potentialProfit}
              </span>
            </div>
            <div className="preview-row">
              <span>Platform fee</span>
              <span className="preview-val">2% on winnings</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && <div className="trade-error">{error}</div>}

        {/* Success */}
        {txSig && (
          <div className="trade-success">
            <span>✓ Trade confirmed on-chain</span>
            <a
              href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="tx-link"
            >
              View on Solana Explorer →
            </a>
          </div>
        )}

        {/* CTA */}
        {connected ? (
          <button
            className={`trade-btn ${side} ${loading ? "loading" : ""}`}
            onClick={handleTrade}
            disabled={loading || !amount}
          >
            {loading ? (
              <span className="trade-btn-loading">
                <span className="spinner" /> Confirming on-chain...
              </span>
            ) : (
              `Buy ${selectedTeam} @ ${(selectedPrice * 100).toFixed(0)}¢`
            )}
          </button>
        ) : (
          <div className="connect-prompt">
            <p>Connect your wallet to trade</p>
            <ClientWalletMultiButton />
          </div>
        )}

        <p className="trade-disclaimer">
          Trades settle on Solana devnet. Prices reflect crowd consensus, not a bookmaker.
        </p>
      </div>
    </div>
  );
}
