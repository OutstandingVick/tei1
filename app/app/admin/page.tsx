"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { MOCK_MATCHES } from "@/lib/matches";
import { getMarketPda, getPlatformPda } from "@/lib/program";
import IDL from "@/lib/idl.json";
import { ClientWalletMultiButton } from "@/components/ClientWalletMultiButton";

type OutcomeKey = "homeWin" | "awayWin" | "draw";

type MarketRow = {
  matchId: string;
  title: string;
  status: string;
  outcome: string;
  exists: boolean;
};

function humanizeOutcome(key: string) {
  if (key === "homeWin") return "Home Win";
  if (key === "awayWin") return "Away Win";
  if (key === "draw") return "Draw";
  return "Undecided";
}

function humanizeStatus(key: string) {
  if (key === "open") return "Open";
  if (key === "resolved") return "Resolved";
  if (key === "closed") return "Closed";
  return key || "Unknown";
}

export default function AdminPage() {
  const { connection } = useConnection();
  const { connected, publicKey, signTransaction } = useWallet();
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [authority, setAuthority] = useState<string | null>(null);
  const [loadingRows, setLoadingRows] = useState<Record<string, boolean>>({});

  const isAuthorized = useMemo(
    () => Boolean(publicKey && authority && publicKey.toBase58() === authority),
    [publicKey, authority]
  );

  const fetchAdminState = useCallback(async () => {
    try {
      const provider = new AnchorProvider(
        connection,
        {
          publicKey: publicKey ?? new PublicKey("11111111111111111111111111111111"),
          signTransaction: async (tx) => tx,
          signAllTransactions: async (txs) => txs,
        },
        { commitment: "confirmed" }
      );
      const program = new Program(IDL as Idl, provider);
      const [platformPda] = getPlatformPda();
      const platform: any = await (program.account as any).platform.fetch(platformPda);
      setAuthority(platform.authority.toBase58());

      const rows = await Promise.all(
        MOCK_MATCHES.map(async (m) => {
          const [marketPda] = getMarketPda(m.matchId);
          try {
            const market: any = await (program.account as any).market.fetch(marketPda);
            const statusKey = Object.keys(market.status ?? {})[0];
            const outcomeKey = Object.keys(market.outcome ?? {})[0];
            return {
              matchId: m.matchId,
              title: `${m.homeTeam} vs ${m.awayTeam}`,
              status: humanizeStatus(statusKey),
              outcome: humanizeOutcome(outcomeKey),
              exists: true,
            };
          } catch {
            return {
              matchId: m.matchId,
              title: `${m.homeTeam} vs ${m.awayTeam}`,
              status: "Not Found",
              outcome: "Undecided",
              exists: false,
            };
          }
        })
      );
      setMarkets(rows);
    } catch (e: any) {
      setError(e?.message || "Failed to load admin state.");
    }
  }, [connection, publicKey]);

  useEffect(() => {
    fetchAdminState();
  }, [fetchAdminState]);

  const resolveMarket = useCallback(
    async (matchId: string, outcome: OutcomeKey) => {
      if (!connected || !publicKey || !signTransaction) return;
      if (!isAuthorized) {
        setError("Connected wallet is not the platform authority.");
        return;
      }

      const rowKey = `${matchId}:${outcome}`;
      setLoadingRows((prev) => ({ ...prev, [rowKey]: true }));
      setError(null);
      setSuccess(null);
      try {
        const provider = new AnchorProvider(
          connection,
          { publicKey, signTransaction, signAllTransactions: async (txs) => txs },
          { commitment: "confirmed" }
        );
        const program = new Program(IDL as Idl, provider);
        const [marketPda] = getMarketPda(matchId);
        const outcomeArg =
          outcome === "homeWin"
            ? { homeWin: {} }
            : outcome === "awayWin"
              ? { awayWin: {} }
              : { draw: {} };

        const sig = await (program.methods as any)
          .resolveMarket(outcomeArg)
          .accounts({
            market: marketPda,
            authority: publicKey,
          })
          .rpc();

        setSuccess(`Resolved ${matchId} (${humanizeOutcome(outcome)}) · ${sig}`);
        fetchAdminState();
      } catch (e: any) {
        setError(e?.message || "Failed to resolve market.");
      } finally {
        setLoadingRows((prev) => ({ ...prev, [rowKey]: false }));
      }
    },
    [connected, publicKey, signTransaction, connection, isAuthorized, fetchAdminState]
  );

  return (
    <div className="admin-page">
      <Link href="/" className="back-link">← Back to Markets</Link>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h1 className="admin-title">Admin Resolve Panel</h1>
          <span className="admin-subtitle">Manual oracle for demo flow</span>
        </div>
        <div className="admin-note">
          <strong>Oracle status:</strong> Manual. Match outcomes are currently set by the platform authority wallet for demo purposes.
        </div>

        {!connected && (
          <div className="connect-prompt">
            <p>Connect wallet to resolve markets</p>
            <ClientWalletMultiButton />
          </div>
        )}

        {connected && (
          <div className="admin-meta">
            <div className="balance-row">
              <span className="balance-label">Connected:</span>
              <span className="balance-val">{publicKey?.toBase58()}</span>
            </div>
            <div className="balance-row">
              <span className="balance-label">Authority:</span>
              <span className="balance-val">{authority ?? "Loading..."}</span>
            </div>
            {!isAuthorized && authority && (
              <div className="trade-error">
                Only the platform authority wallet can resolve markets.
              </div>
            )}
          </div>
        )}

        {error && <div className="trade-error">{error}</div>}
        {success && <div className="trade-success">{success}</div>}

        <div className="admin-grid">
          {markets.map((row) => (
            <div className="admin-row" key={row.matchId}>
              <div className="admin-row-main">
                <div className="admin-row-title">{row.title}</div>
                <div className="admin-row-meta">
                  <span>Status: {row.status}</span>
                  <span>Outcome: {row.outcome}</span>
                  <span>{row.matchId}</span>
                </div>
              </div>
              <div className="admin-actions">
                <button
                  className="quick-btn"
                  disabled={!connected || !isAuthorized || !row.exists || loadingRows[`${row.matchId}:homeWin`]}
                  onClick={() => resolveMarket(row.matchId, "homeWin")}
                >
                  {loadingRows[`${row.matchId}:homeWin`] ? "Resolving..." : "Home Win"}
                </button>
                <button
                  className="quick-btn"
                  disabled={!connected || !isAuthorized || !row.exists || loadingRows[`${row.matchId}:awayWin`]}
                  onClick={() => resolveMarket(row.matchId, "awayWin")}
                >
                  {loadingRows[`${row.matchId}:awayWin`] ? "Resolving..." : "Away Win"}
                </button>
                <button
                  className="quick-btn"
                  disabled={!connected || !isAuthorized || !row.exists || loadingRows[`${row.matchId}:draw`]}
                  onClick={() => resolveMarket(row.matchId, "draw")}
                >
                  {loadingRows[`${row.matchId}:draw`] ? "Resolving..." : "Draw"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
