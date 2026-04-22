"use client";

import { useState, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Match } from "@/lib/matches";
import { calculateSharesOut } from "@/lib/program";

type Side = "yes" | "no";

export function TradePanel({ match }: { match: Match }) {
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();

  const [side, setSide] = useState<Side>("yes");
  const [amount, setAmount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mock liquidity for AMM preview (in real app pulled from chain)
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
    if (!connected || !publicKey) return;
    if (!usdcIn || usdcIn <= 0) {
      setError("Enter an amount to trade");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // In MUP: simulate the transaction flow
      // Real implementation: call program.methods.buyShares(...)
      await new Promise((r) => setTimeout(r, 1800));

      // Mock tx sig for demo
      const mockSig = Array.from({ length: 64 }, () =>
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"[
          Math.floor(Math.random() * 62)
        ]
      ).join("");

      setTxSig(mockSig);
      setAmount("");
    } catch (e: any) {
      setError(e?.message || "Transaction failed");
    } finally {
      setLoading(false);
    }
  }, [connected, publicKey, usdcIn, side, match]);

  const selectedTeam = side === "yes" ? match.homeTeam : match.awayTeam;
  const selectedPrice = side === "yes" ? match.yesPrice : match.noPrice;

  return (
    <div className="trade-panel">
      <div className="trade-panel-header">
        <h2 className="trade-title">Trade Outcome</h2>
        <span className="trade-market-type">Match Winner</span>
      </div>

      {/* Side selector */}
      <div className="side-selector">
        <button
          className={`side-btn yes ${side === "yes" ? "active" : ""}`}
          onClick={() => { setSide("yes"); setTxSig(null); }}
        >
          <span className="side-btn-team">{match.homeTeam}</span>
          <span className="side-btn-prob">
            {(match.yesPrice * 100).toFixed(0)}%
          </span>
        </button>
        <button
          className={`side-btn no ${side === "no" ? "active" : ""}`}
          onClick={() => { setSide("no"); setTxSig(null); }}
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
            onChange={(e) => { setAmount(e.target.value); setTxSig(null); setError(null); }}
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
          <span>✓ Trade placed on {selectedTeam}</span>
          <a
            href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="tx-link"
          >
            View on Explorer →
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
              <span className="spinner" /> Confirming...
            </span>
          ) : (
            `Buy ${selectedTeam} @ ${(selectedPrice * 100).toFixed(0)}¢`
          )}
        </button>
      ) : (
        <div className="connect-prompt">
          <p>Connect your wallet to trade</p>
          <WalletMultiButton />
        </div>
      )}

      <p className="trade-disclaimer">
        Trades are peer-to-peer. Prices reflect crowd consensus, not a bookmaker.
        Built on Solana devnet.
      </p>
    </div>
  );
}
