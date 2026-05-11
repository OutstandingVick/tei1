"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor";
import { SystemProgram } from "@solana/web3.js";
import {
  createSealedIntent,
  deriveOpeningOdds,
  ENCRYPT_PRE_ALPHA_NOTE,
  PrivateAuctionIntent,
  PrivateAuctionSide,
} from "@/lib/encryptAuction";
import IDL from "@/lib/idl.json";
import {
  getPrivateAuctionPda,
  getPrivateIntentPda,
} from "@/lib/program";

const demoFixtures = [
  "Liverpool vs Chelsea",
  "Barcelona vs Real Madrid",
  "West Ham vs Arsenal",
];

const demoMarkets = [
  "Match Winner",
  "Yellow Cards O/U 4.5",
  "Fouls O/U 21.5",
];

const protocolSteps = [
  {
    title: "1. Seal locally",
    body: "The client commits to side, amount, fixture, and nonce before anything public can read the trader's conviction.",
  },
  {
    title: "2. Commit on-chain",
    body: "A PrivateIntent PDA stores only the 32-byte commitment. The user wallet, auction PDA, and timestamp are auditable.",
  },
  {
    title: "3. Reveal aggregate",
    body: "Only total YES/NO demand is finalized to derive opening odds for the public AMM.",
  },
];

const evidenceCards = [
  {
    label: "Protocol account",
    value: "PrivateAuction PDA",
    detail: "Auction window, commitment count, status, and finalized opening odds.",
  },
  {
    label: "User account",
    value: "PrivateIntent PDA",
    detail: "One sealed commitment per wallet per auction.",
  },
  {
    label: "Encrypt path",
    value: "Hash -> REFHE",
    detail: "Current digest boundary can be replaced by Encrypt ciphertext as the SDK matures.",
  },
];

function compactAuctionId(fixture: string, market: string) {
  const clean = `${fixture}_${market}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return `pa_${clean}`.slice(0, 32);
}

function marketTypeFor(market: string) {
  return market === "Match Winner" ? { matchWinner: {} } : { overUnder: {} };
}

export default function PrivateAuctionPage() {
  const { connection } = useConnection();
  const { connected, publicKey, signTransaction } = useWallet();
  const [fixture, setFixture] = useState(demoFixtures[0]);
  const [market, setMarket] = useState(demoMarkets[0]);
  const [side, setSide] = useState<PrivateAuctionSide>("yes");
  const [amount, setAmount] = useState("25");
  const [intents, setIntents] = useState<PrivateAuctionIntent[]>([
    {
      id: "seed-yes",
      fixture: demoFixtures[0],
      market: demoMarkets[0],
      side: "yes",
      amount: 80,
      sealedCommitment: "enc-prealpha:8b7f3b9a4f2c12ef9ab42d0e4a91388c",
      commitmentBytes: Array(32).fill(8),
      createdAt: new Date().toISOString(),
    },
    {
      id: "seed-no",
      fixture: demoFixtures[0],
      market: demoMarkets[0],
      side: "no",
      amount: 120,
      sealedCommitment: "enc-prealpha:1d904cfe703bc93db2a781140ad5c277",
      commitmentBytes: Array(32).fill(1),
      createdAt: new Date().toISOString(),
    },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [onChainCommitments, setOnChainCommitments] = useState<number | null>(null);
  const [finalizedOdds, setFinalizedOdds] = useState<{
    yesBps: number;
    noBps: number;
  } | null>(null);

  const auctionId = useMemo(
    () => compactAuctionId(fixture, market),
    [fixture, market]
  );
  const auctionPda = useMemo(
    () => getPrivateAuctionPda(auctionId)[0],
    [auctionId]
  );

  const visibleIntents = useMemo(
    () =>
      intents.filter(
        (intent) => intent.fixture === fixture && intent.market === market
      ),
    [intents, fixture, market]
  );
  const aggregate = useMemo(
    () => deriveOpeningOdds(visibleIntents),
    [visibleIntents]
  );

  const getProgram = () => {
    if (!publicKey || !signTransaction) {
      throw new Error("Connect your wallet to submit sealed intents on-chain.");
    }

    const provider = new AnchorProvider(
      connection,
      {
        publicKey,
        signTransaction,
        signAllTransactions: async (txs) => txs,
      },
      { commitment: "confirmed" }
    );

    return new Program(IDL as Idl, provider);
  };

  const fetchAuction = async () => {
    try {
      const readOnlyWallet = {
        publicKey: publicKey ?? auctionPda,
        signTransaction: async (tx: unknown) => tx,
        signAllTransactions: async (txs: unknown[]) => txs,
      };
      const provider = new AnchorProvider(
        connection,
        readOnlyWallet as never,
        { commitment: "confirmed" }
      );
      const program = new Program(IDL as Idl, provider);
      const account: any = await (program.account as any).privateAuction
        .fetchNullable(auctionPda)
        .catch(() => null);

      if (!account) {
        setOnChainCommitments(null);
        setFinalizedOdds(null);
        return;
      }

      setOnChainCommitments(account.totalCommitments.toNumber());
      if (account.status?.finalized) {
        setFinalizedOdds({
          yesBps: account.openingYesBps.toNumber(),
          noBps: account.openingNoBps.toNumber(),
        });
      } else {
        setFinalizedOdds(null);
      }
    } catch {
      setOnChainCommitments(null);
      setFinalizedOdds(null);
    }
  };

  useEffect(() => {
    void fetchAuction();
  }, [auctionPda.toBase58(), connection, publicKey]);

  const handleSubmit = async () => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    setSubmitting(true);
    setError("");
    setStatus("Preparing sealed commitment...");

    try {
      const sealed = await createSealedIntent({
        fixture,
        market,
        side,
        amount: parsed,
      });

      const program = getProgram();
      const auctionAccount: any = await (program.account as any).privateAuction
        .fetchNullable(auctionPda)
        .catch(() => null);

      if (!auctionAccount) {
        const now = Math.floor(Date.now() / 1000);
        setStatus("Initializing private auction PDA...");
        await (program.methods as any)
          .initializePrivateAuction(
            auctionId,
            auctionId.replace("pa_", "fx_").slice(0, 32),
            marketTypeFor(market),
            new BN(now - 60),
            new BN(now + 60 * 60)
          )
          .accounts({
            auction: auctionPda,
            authority: publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
      }

      const [intentPda] = getPrivateIntentPda(auctionPda, publicKey!);
      setStatus("Submitting sealed intent on-chain...");
      const signature = await (program.methods as any)
        .submitPrivateIntent(sealed.commitmentBytes)
        .accounts({
          auction: auctionPda,
          intent: intentPda,
          user: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setIntents((prev) => [{ ...sealed, signature }, ...prev]);
      setStatus("Sealed intent recorded on-chain.");
      await fetchAuction();
    } catch (e: any) {
      const message = `${e?.message ?? e}`;
      if (message.includes("already in use")) {
        setError("This wallet already submitted a sealed intent for this auction.");
      } else {
        setError(message);
      }
      setStatus("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFinalize = async () => {
    if (!visibleIntents.length) return;

    setFinalizing(true);
    setError("");
    setStatus("Finalizing aggregate opening odds on-chain...");

    try {
      const program = getProgram();
      await (program.methods as any)
        .finalizePrivateAuction(
          new BN(Math.floor(aggregate.yesDemand * 1_000_000)),
          new BN(Math.floor(aggregate.noDemand * 1_000_000))
        )
        .accounts({
          auction: auctionPda,
          authority: publicKey,
        })
        .rpc();

      setStatus("Aggregate demand finalized on-chain.");
      await fetchAuction();
    } catch (e: any) {
      setError(`${e?.message ?? e}`);
      setStatus("");
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <div className="auction-page">
      <Link href="/" className="back-link">← Back to Markets</Link>

      <section className="auction-hero">
        <div className="hero-eyebrow">Encrypt Sidetrack · Confidential Markets</div>
        <h1 className="hero-title">
          Sealed pre-trade intent<br />
          <span className="hero-accent">for football markets.</span>
        </h1>
        <p className="hero-sub">
          Tei lets users commit directional demand before a market opens without
          leaking trade size or conviction. The public AMM only receives
          aggregate YES/NO demand after the sealed window closes.
        </p>
      </section>

      <section className="auction-note">
        <strong>Pre-alpha honesty note</strong>
        <p>{ENCRYPT_PRE_ALPHA_NOTE}</p>
      </section>

      <section className="auction-protocol">
        {protocolSteps.map((step) => (
          <div key={step.title}>
            <strong>{step.title}</strong>
            <span>{step.body}</span>
          </div>
        ))}
      </section>

      <section className="auction-chain">
        <div>
          <span className="benefit-kicker">On-chain auction PDA</span>
          <strong>{auctionId}</strong>
          <span>{auctionPda.toBase58()}</span>
        </div>
        <div>
          <span className="benefit-kicker">Commitments</span>
          <strong>{onChainCommitments ?? "Not initialized"}</strong>
          <span>{finalizedOdds ? "Finalized aggregate reveal" : "Sealed window open"}</span>
        </div>
        {finalizedOdds ? (
          <div>
            <span className="benefit-kicker">Final odds</span>
            <strong>{(finalizedOdds.yesBps / 100).toFixed(1)}% YES</strong>
            <span>{(finalizedOdds.noBps / 100).toFixed(1)}% NO</span>
          </div>
        ) : null}
      </section>

      <section className="auction-evidence">
        <div>
          <span className="benefit-kicker">What judges should verify</span>
          <h2>Privacy is part of the market mechanism.</h2>
          <p>
            This is not a wrapper around Tei. The sealed auction sits before the
            AMM, captures private demand, and turns the aggregate into opening
            odds. That makes privacy useful to traders, not cosmetic.
          </p>
        </div>
        <div className="auction-evidence-grid">
          {evidenceCards.map((card) => (
            <article key={card.label}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <p>{card.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="auction-grid">
        <div className="auction-card">
          <span className="benefit-kicker">Submit sealed intent</span>
          <div className="auction-form">
            <label>
              Fixture
              <select value={fixture} onChange={(e) => setFixture(e.target.value)}>
                {demoFixtures.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <label>
              Market
              <select value={market} onChange={(e) => setMarket(e.target.value)}>
                {demoMarkets.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <div className="auction-sides">
              <button
                className={side === "yes" ? "active yes" : "yes"}
                onClick={() => setSide("yes")}
              >
                YES
              </button>
              <button
                className={side === "no" ? "active no" : "no"}
                onClick={() => setSide("no")}
              >
                NO
              </button>
            </div>

            <label>
              Amount (USDC)
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
              />
            </label>

            <button className="benefit-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting on-chain..." : "Submit Private Intent"}
            </button>

            {!connected ? (
              <p className="auction-warning">
                Connect Phantom on devnet to write the sealed commitment PDA.
              </p>
            ) : null}
            {status ? <p className="auction-status">{status}</p> : null}
            {error ? <p className="auction-error">{error}</p> : null}
          </div>
        </div>

        <div className="auction-card reveal">
          <span className="benefit-kicker">Aggregate reveal</span>
          <h2>{market}</h2>
          <div className="auction-odds">
            <div>
              <span>YES demand</span>
              <strong>${aggregate.yesDemand.toFixed(2)}</strong>
            </div>
            <div>
              <span>NO demand</span>
              <strong>${aggregate.noDemand.toFixed(2)}</strong>
            </div>
          </div>
          <div className="match-page-prob-bar">
            <div
              className="prob-fill-yes"
              style={{ width: `${aggregate.yesPrice * 100}%` }}
            />
          </div>
          <div className="match-page-prob-labels">
            <span>Opening YES {(aggregate.yesPrice * 100).toFixed(1)}%</span>
            <span>Opening NO {(aggregate.noPrice * 100).toFixed(1)}%</span>
          </div>
          <p>
            Individual intents stay sealed during the auction window. Only
            aggregate demand is used to set the public AMM&apos;s opening odds.
          </p>
          <button
            className="benefit-secondary auction-finalize"
            onClick={handleFinalize}
            disabled={finalizing || !connected || Boolean(finalizedOdds)}
          >
            {finalizing
              ? "Finalizing..."
              : finalizedOdds
                ? "Finalized On-chain"
                : "Finalize Aggregate Reveal"}
          </button>
        </div>
      </section>

      <section className="auction-ledger">
        <div>
          <span className="benefit-kicker">Sealed intent ledger</span>
          <h2>{visibleIntents.length} private submissions</h2>
        </div>
        <div className="auction-intents">
          {visibleIntents.map((intent) => (
            <div key={intent.id}>
              <strong>{intent.sealedCommitment}</strong>
              <span>
                {intent.side.toUpperCase()} intent · amount sealed ·{" "}
                {new Date(intent.createdAt).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {intent.signature ? (
                <Link
                  href={`https://explorer.solana.com/tx/${intent.signature}?cluster=devnet`}
                  target="_blank"
                >
                  View transaction →
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
