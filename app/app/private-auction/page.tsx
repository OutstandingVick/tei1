"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  createSealedIntent,
  deriveOpeningOdds,
  ENCRYPT_PRE_ALPHA_NOTE,
  PrivateAuctionIntent,
  PrivateAuctionSide,
} from "@/lib/encryptAuction";

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

export default function PrivateAuctionPage() {
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
      createdAt: new Date().toISOString(),
    },
    {
      id: "seed-no",
      fixture: demoFixtures[0],
      market: demoMarkets[0],
      side: "no",
      amount: 120,
      sealedCommitment: "enc-prealpha:1d904cfe703bc93db2a781140ad5c277",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [submitting, setSubmitting] = useState(false);

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

  const handleSubmit = async () => {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    setSubmitting(true);
    const sealed = await createSealedIntent({
      fixture,
      market,
      side,
      amount: parsed,
    });
    setIntents((prev) => [sealed, ...prev]);
    setSubmitting(false);
  };

  return (
    <div className="auction-page">
      <Link href="/" className="back-link">← Back to Markets</Link>

      <section className="auction-hero">
        <div className="hero-eyebrow">Encrypt Prototype</div>
        <h1 className="hero-title">
          Private opening auctions<br />
          <span className="hero-accent">for football markets.</span>
        </h1>
        <p className="hero-sub">
          Tei uses Encrypt&apos;s confidential-computing direction to prototype
          sealed pre-market intent. Users can submit directional demand without
          exposing trade size or conviction before public AMM trading begins.
        </p>
      </section>

      <section className="auction-note">
        <strong>Pre-alpha honesty note</strong>
        <p>{ENCRYPT_PRE_ALPHA_NOTE}</p>
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
              {submitting ? "Sealing intent..." : "Submit Private Intent"}
            </button>
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
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
