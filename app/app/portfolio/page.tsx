"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ClientWalletMultiButton } from "@/components/ClientWalletMultiButton";
import { Match, MOCK_MATCHES } from "@/lib/matches";
import { useLiveMatches } from "@/lib/liveMarkets";
import { getMarketPda, getPlatformPda, getPositionPda, USDC_MINT } from "@/lib/program";
import IDL from "@/lib/idl.json";

type PositionRow = {
  match: Match;
  yesShares: number;
  noShares: number;
  totalSpent: number;
  claimed: boolean;
  marketResolved: boolean;
  marketOutcome: string;
};

type PortfolioFilter = "all" | "open" | "resolved" | "claimed";
type PortfolioSort = "recent" | "largest";

function humanizeOutcome(outcomeKey: string) {
  if (outcomeKey === "homeWin") return "Home Win";
  if (outcomeKey === "awayWin") return "Away Win";
  if (outcomeKey === "draw") return "Draw";
  return "Undecided";
}

export default function PortfolioPage() {
  const { connection } = useConnection();
  const { connected, publicKey, signTransaction } = useWallet();
  const matches = useLiveMatches(MOCK_MATCHES);
  const [rows, setRows] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<PortfolioFilter>("all");
  const [sortBy, setSortBy] = useState<PortfolioSort>("recent");

  const fetchPortfolio = useCallback(async () => {
    if (!publicKey) {
      setRows([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const provider = new AnchorProvider(
        connection,
        {
          publicKey,
          signTransaction: async (tx) => tx,
          signAllTransactions: async (txs) => txs,
        },
        { commitment: "confirmed" }
      );
      const program = new Program(IDL as Idl, provider);

      const data = await Promise.all(
        matches.map(async (match) => {
          const [marketPda] = getMarketPda(match.matchId);
          const [positionPda] = getPositionPda(marketPda, publicKey);
          try {
            const [position, market] = await Promise.all([
              (program.account as any).position.fetch(positionPda),
              (program.account as any).market.fetch(marketPda),
            ]);
            const yesShares = position.yesShares.toNumber() / 1_000_000;
            const noShares = position.noShares.toNumber() / 1_000_000;
            if (yesShares <= 0 && noShares <= 0) return null;

            const statusKey = Object.keys(market.status ?? {})[0];
            const outcomeKey = Object.keys(market.outcome ?? {})[0];
            return {
              match,
              yesShares,
              noShares,
              totalSpent: position.totalSpent.toNumber() / 1_000_000,
              claimed: position.claimed,
              marketResolved: statusKey === "resolved",
              marketOutcome: humanizeOutcome(outcomeKey),
            } satisfies PositionRow;
          } catch {
            return null;
          }
        })
      );

      setRows(data.filter(Boolean) as PositionRow[]);
    } catch (e: any) {
      setError(e?.message || "Failed to load portfolio.");
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey, matches]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const handleClaim = useCallback(
    async (row: PositionRow) => {
      if (!connected || !publicKey || !signTransaction) return;
      const key = row.match.matchId;
      setClaiming((prev) => ({ ...prev, [key]: true }));
      setError(null);
      setSuccess(null);
      try {
        const provider = new AnchorProvider(
          connection,
          { publicKey, signTransaction, signAllTransactions: async (txs) => txs },
          { commitment: "confirmed" }
        );
        const program = new Program(IDL as Idl, provider);
        const [marketPda] = getMarketPda(row.match.matchId);
        const [positionPda] = getPositionPda(marketPda, publicKey);
        const [platformPda] = getPlatformPda();

        const userUsdcAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);
        const [marketAccount, platformAccount] = await Promise.all([
          (program.account as any).market.fetch(marketPda),
          (program.account as any).platform.fetch(platformPda),
        ]);
        const claimIx = await (program.methods as any)
          .claimWinnings()
          .accounts({
            market: marketPda,
            position: positionPda,
            vault: marketAccount.vault as PublicKey,
            userUsdc: userUsdcAta,
            treasury: platformAccount.treasury as PublicKey,
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

        const signed = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize(), {
          preflightCommitment: "confirmed",
          maxRetries: 3,
        });
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed"
        );

        setSuccess(`Claim successful for ${row.match.homeTeam} vs ${row.match.awayTeam}. Tx: ${sig}`);
        fetchPortfolio();
      } catch (e: any) {
        const message = `${e?.message ?? ""} ${e?.error?.message ?? ""}`;
        if (message.includes("MarketNotResolved")) {
          setError("Market is not resolved yet.");
        } else if (message.includes("AlreadyClaimed")) {
          setError("Winnings already claimed.");
        } else if (message.includes("NoWinningShares")) {
          setError("No winning shares for this market.");
        } else if (message.includes("User rejected") || message.includes("rejected")) {
          setError("Transaction cancelled.");
        } else {
          setError(e?.error?.message || e?.message || "Claim failed.");
        }
      } finally {
        setClaiming((prev) => ({ ...prev, [key]: false }));
      }
    },
    [connected, publicKey, signTransaction, connection, fetchPortfolio]
  );

  const totalSpent = useMemo(
    () => rows.reduce((sum, r) => sum + r.totalSpent, 0),
    [rows]
  );
  const openPositions = useMemo(
    () => rows.filter((r) => !r.marketResolved).length,
    [rows]
  );

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (filter === "open") return !row.marketResolved;
      if (filter === "resolved") return row.marketResolved;
      if (filter === "claimed") return row.claimed;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "largest") {
        return b.totalSpent - a.totalSpent;
      }
      return new Date(b.match.kickoff).getTime() - new Date(a.match.kickoff).getTime();
    });
    return sorted;
  }, [rows, filter, sortBy]);

  return (
    <div className="portfolio-page">
      <section className="portfolio-head">
        <h1 className="portfolio-title">Portfolio</h1>
        <span className="portfolio-subtitle">All your market positions and claim status</span>
      </section>

      {!connected && (
        <section className="portfolio-panel">
          <div className="connect-prompt">
            <p>Connect wallet to view your positions</p>
            <ClientWalletMultiButton />
          </div>
        </section>
      )}

      {connected && (
        <>
          <section className="portfolio-panel">
            <div className="portfolio-stats">
              <div className="match-stat">
                <span className="match-stat-label">Open Positions</span>
                <span className="match-stat-val">{openPositions}</span>
              </div>
              <div className="match-stat">
                <span className="match-stat-label">Total Spent</span>
                <span className="match-stat-val">${totalSpent.toFixed(2)}</span>
              </div>
              <div className="match-stat">
                <span className="match-stat-label">Wallet</span>
                <span className="match-stat-val portfolio-wallet">{publicKey?.toBase58()}</span>
              </div>
            </div>
          </section>

          {error && <div className="trade-error">{error}</div>}
          {success && <div className="trade-success">{success}</div>}

          <section className="portfolio-panel">
            {loading && <div className="match-stat-label">Loading positions...</div>}

            {!loading && rows.length === 0 && (
              <div className="portfolio-empty">
                <p>No positions yet. Place your first trade from the market page.</p>
                <Link href="/" className="quick-btn">Browse Markets</Link>
              </div>
            )}

            {!loading && rows.length > 0 && (
              <>
                <div className="portfolio-controls">
                  <div className="portfolio-control-group">
                    {([
                      { key: "all", label: "All" },
                      { key: "open", label: "Open" },
                      { key: "resolved", label: "Resolved" },
                      { key: "claimed", label: "Claimed" },
                    ] as const).map((item) => (
                      <button
                        key={item.key}
                        className={`portfolio-control-btn ${filter === item.key ? "active" : ""}`}
                        onClick={() => setFilter(item.key)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="portfolio-control-group">
                    <button
                      className={`portfolio-control-btn ${sortBy === "recent" ? "active" : ""}`}
                      onClick={() => setSortBy("recent")}
                    >
                      Most recent
                    </button>
                    <button
                      className={`portfolio-control-btn ${sortBy === "largest" ? "active" : ""}`}
                      onClick={() => setSortBy("largest")}
                    >
                      Largest position
                    </button>
                  </div>
                </div>

                {visibleRows.length === 0 && (
                  <div className="portfolio-empty">
                    <p>No positions match this filter.</p>
                  </div>
                )}

                <div className="portfolio-grid">
                  {visibleRows.map((row) => {
                  const totalShares = row.yesShares + row.noShares;
                  const key = row.match.matchId;
                  const canClaim = row.marketResolved && !row.claimed;
                  return (
                    <div key={key} className="portfolio-card">
                      <div className="portfolio-card-head">
                        <div className="portfolio-card-title">
                          {row.match.homeTeam} vs {row.match.awayTeam}
                        </div>
                        <span className="portfolio-chip">{row.match.league}</span>
                      </div>

                      <div className="portfolio-rows">
                        <div className="portfolio-row">
                          <span>YES shares</span>
                          <strong>{row.yesShares.toFixed(2)}</strong>
                        </div>
                        <div className="portfolio-row">
                          <span>NO shares</span>
                          <strong>{row.noShares.toFixed(2)}</strong>
                        </div>
                        <div className="portfolio-row">
                          <span>Total shares</span>
                          <strong>{totalShares.toFixed(2)}</strong>
                        </div>
                        <div className="portfolio-row">
                          <span>Spent</span>
                          <strong>${row.totalSpent.toFixed(2)}</strong>
                        </div>
                        <div className="portfolio-row">
                          <span>Market status</span>
                          <strong>{row.marketResolved ? `Resolved (${row.marketOutcome})` : "Open"}</strong>
                        </div>
                      </div>

                      <div className="portfolio-actions">
                        <Link href={`/match/${row.match.id}`} className="quick-btn">Open Market</Link>
                        {canClaim && (
                          <button
                            className="trade-btn yes"
                            onClick={() => handleClaim(row)}
                            disabled={Boolean(claiming[key])}
                          >
                            {claiming[key] ? "Claiming..." : "Claim Winnings"}
                          </button>
                        )}
                        {row.claimed && <div className="trade-success">✓ Already claimed</div>}
                      </div>
                    </div>
                  );
                })}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
